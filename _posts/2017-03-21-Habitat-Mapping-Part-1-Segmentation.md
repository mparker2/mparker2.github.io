---
title: "Habitat Maps Part 1: Segmentation"
layout: single
header:
  image: /assets/images/segmentation_images/devon_segs.png
  teaser: /assets/images/segmentation_images/devon_segs.png
read_time: false
comments: true
share: true
related: true
excerpt: "segmenting satellite data using skimage and rasterio"
tags: [habitats, segmentation, gis]
---


As part of my PhD, I was required to do a 3 month placement in a "non-academic" setting, which basically could mean anything. I managed to organise a placement with [Natural England](https://www.gov.uk/government/organisations/natural-england), an group which advises the government on conservation and "natural" land management.

I was placed on the Earth Observation team, helping to build maps of habitat classifications in Devon and Cumbria. This was essentially a machine learning problem, where we segmented satellite images into homogeneous pieces (e.g. a bit of woodland, or a bit of grassland, etc.), and then using supervised learning techniques to label each segment with a particular habitat class.

In this post I want to talk specifically about the problem of segmentation. After doing a bit of research (I had never done any image processing before this project), I ended up writing a small plugin for the amazing `rasterio` python library, which uses `scikit-image` to do the segmentation. The features I aimed to include were:

* the ability to segment using multiple overlapping raster images taken on different dates. This reduces gaps in the output caused by clouds which obscure areas of each individual image.
* the ability to include a shapefile of existing knowledge of the landscape in the segmentation process, to improve the segments produced.
* relatively low memory usage! These raster images are *LARGE* and storing multiple copies of them in memory was not really an option.

Amazingly given my inexperience, I managed to muddle together a method for doing this. Its definitely not perfect, but seemed to work relatively well, at least for the areas and images we were initially interested in.

**NB**: this post is modified from the example notebook I added to the project. I deleted some bits. You can find the original [here](https://github.com/mparker2/rio-segment/blob/master/examples/segmentation_example.ipynb).

```python
import sys
import os
import itertools as it
import numpy as np
from matplotlib import pyplot as plt
from skimage import segmentation

# import segmentation functions
import rio_segment as rseg
```

## Edge detection

Here we are using two sentinel S2 satellite images of a small example region of Devon. Each raster has 10 different "bands" (images taken at different wavelengths). The first raster in the list is used as a template, all following rasters are clipped to the extent of this template and resized so that the resulting arrays have the same dimensions.

I decided to use the watershed method for segmentation. The input to this is basically a single channel image of detected edges (regions with large changes in pixel intensity). The `edges_from_raster_and_shp` function produces this by performing sobel edge detection on each band of each raster image in turn, then taking the maximum pixel intensity for each position from all the edgemaps.

We are also including a shapefile of known land use information. The edges from these shapes are rasterized into an array of the same shape as the template raster, and included as layers when computing the max pixel intensity. The weight of this information over the spectral data can be altered using the `shp_weight` parameter - it can be set between zero (no effect) and 255.


```python
rasters = [
    './NDevonDart_S2_20160719_37_5_mask_clipped.tif',
    './NDevonDart_S20161106_37_5_mask_clipped.tif'
]

shapes = [
    './boundaries.shp'
]

edges, mask, t, c = rseg.edges_from_raster_and_shp(
    rasters, shapes, shp_weight=180, fill_holes=True, perc=(0, 98), no_data=0
)

# zoomed in view of river, bit of urban and some arable
fig, ax = plt.subplots(figsize=(10, 10))
img = ax.imshow(edges)
plt.colorbar(img)
ax.set_xlim(0, 200)
ax.set_ylim(400, 200)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/segmentation_images/segmentation_example_5_0.png)


The approach we are using to initially segment the image is watershed. The `watershed_segment` function produces seeds in local minima of the edge map, then grows these into segments using watershedding. Adjusting the footprint size of the seed production will alter the number of segments produced - the smaller the footprint, the more segments that are produced. Setting to one will produce the max possible number of segments.


```python
labels = rseg.watershed_segment(edges, footprint_size=3)
marked_labels = segmentation.find_boundaries(labels)

fig, ax = plt.subplots(figsize=(10, 10))
ax.imshow(np.maximum(marked_labels*255, edges))
plt.colorbar(img)
ax.set_xlim(0, 200)
ax.set_ylim(400, 200)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/segmentation_images/segmentation_example_9_0.png)


Using a small footprint results in a wildly oversegmented image, however it is a good way of making sure we capture all the "real" edges and all small features. We can then merge adjacent segments which are very similar using a graph based approach (region adjacency graph, or RAG) to produce a set of segments which represent the features of the image much better.

The edges of the RAG are weighted using the mean pixel intensity of the boundary between the two segments in the edgemap. This is one of the RAG production methods already implemented in `skimage`. I wanted the segments to be relatively equally sized, so I also added in a size penalty to the edges based on total size in pixels of the two nodes, to prevent any merges getting too big. The `size_pen` parameter can be used to increase or decrease the strength of this behaviour, or set to zero to turn off.

Once the RAG has been created, the threshold percentile for merging is calculated from the distribution of edge weights, from the `threshold` parameter (a percentile). Nodes of the graph (and their corresponding segments) are repeatedly merged under there are no longer any edge weights below this value.


```python
refined_labels = rseg.rag_merge_threshold(edges, labels,
                                          threshold=40,
                                          size_pen=10)
marked_refined_labels = segmentation.find_boundaries(refined_labels)

fig, ax = plt.subplots(figsize=(10, 10))
ax.imshow(np.maximum(marked_refined_labels*255, edges))
plt.colorbar(img)
ax.set_xlim(0, 200)
ax.set_ylim(400, 200)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/segmentation_images/segmentation_example_13_0.png)

That's it! We have some segments to use to produce our classifications. I also did some analysis of the best values for the `shp_weight`, `footprint`, `threshold`, and `size_pen` parameters in the original notebook. If you are still interested (I really doubt anyone has even read this far), go there to take a look. If you remember that far back, I posted the link at the top of this article. And if you are really really interested, take a look at the code I wrote behind the mystery functions I used here!

At some point I will add another post explaining how we did the next step - classification. It involves random forests, yay.
