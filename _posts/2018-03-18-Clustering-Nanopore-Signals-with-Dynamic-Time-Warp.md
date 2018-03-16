---
title: "Clustering Nanopore Signals With Dynamic Time Warp"
layout: single
header:
  image: /assets/images/read_until/output_5_0.png
  teaser: /assets/images/read_until/output_5_0.png
read_time: false
comments: true
share: true
related: true
excerpt: "Can we create real-time selective sequencing software?"
tags: [nanopore, signal-processing, bioinformatics]
---


Last weeekend I attended the [HackMed](http://hackmed.uk/) hackathon in Sheffield, which was sponsored by [Oxford Nanopore](https://nanoporetech.com/resource-centre/videos/nanopore-dna-sequencing). Nanopore is a really exciting technology in the field of DNA and RNA sequencing, since it has huge improvements in speed and portability compared to rivals. One pretty amazing benefit of Nanopore, which was outlined recently in a [nature methods paper](https://www.nature.com/articles/nmeth.3930), is “Read Until”. Since Nanopore sequencing works by measuring changes in membrane potential in real time, it is theoretically possible to work out what is being sequenced at any given moment, and reject unwanted sequences by reversing the membrane potential. This has a lot of potential applications, but as it was a medical hackathon, we decided to try and use this approach to develop gene panel sequencing software, like the panels which are currently to diagnose the genetic changes associated with various cancers. Lets say you have 50 genes which are known players in a particular form of cancer. With this idea, you could sequence these specific genes from a pool of all a patients DNA or RNA, without performing any kind of [selective amplification procedure](https://emea.illumina.com/areas-of-interest/cancer/research/sequencing-methods/targeted-cancer-seq.html) beforehand.

The first thing we had to do was collect some example data to work with. Luckily for us, there is a lot of human nanopore data [available online](https://github.com/nanopore-wgs-consortium/NA12878) from a recently published project by the “Nanopore WGS Consortium”. This includes both DNA, cDNA and direct RNA sequences. We decided to use the direct RNA. This had a short term technical advantage: mRNA sequences have a defined “end point”, i.e. the polyA tail. If we could identify the polyA tail and extract the signal after it, we would have a time series which ought to be relatively consistent amongst reads arising from the same transcript. There are some obvious drawbacks to using Read Until with RNA, however; namely that RNA molecules are mostly relatively short compared to the genomic DNA fragments sequenced by Nanopore, so the resource saving from sequencing a bit then rejecting is probably not so great. The second issue is that most RNA-seq experiments wish to derive abundance measures for each transcript of interest, and by selecting for particular ones we are going to mess those measures up. But lets not worry about that for now!

We downloaded the raw fast5 files and the aligned bam files from AWS and used the alignments of the basecalled reads to label a few thousand raw signals with an ENSEMBL transcript id from which they arose. We then picked the top 50 most abundant transcripts (each having at least 20-something or more reads mapping to it) as our dataset.

Here is what the raw signal from a Nanopore direct RNA read looks like (from the [Nanopore WGS Consortium GitHub page](https://github.com/nanopore-wgs-consortium/NA12878/blob/master/RNA.md)):

![directRNA](https://github.com/nanopore-wgs-consortium/NA12878/raw/master/rna_slides/Slide09.png)

The RNA is sequenced from 3’ to 5’. The first section in yellow is some kind of leader sequence, followed by a sequencing adaptor (red), and then the polyA tail (green). After that we get into the mRNA signal which is unique to each transcript. We played around with a few different methods for identifying the end of the polyA tail, but eventually settled on using signal convolution followed by local maxima/minima detection, which worked pretty well. Convolution is commonly used in signal processing for doing step detection. In the convolved sequence, the first large local maximum in the signal is generally at the leftmost end of the polyA signal. Since the polyA signal is usually pretty flat, the next local minima is most likely to be the rightmost end, i.e. where the polyA signal ends and the transcript specific signal starts. Once we had these start locations, we then extracted the next 3000 events (about 1 seconds worth of sequencing at 3kHz) to use for transcript identification. 


```python
import numpy as np
from scipy.signal import argrelextrema

def find_polyA(signal, start_max_order=500, end_min_order=50):
    assert signal.ndim == 1
    # poly A is pretty much always in first 20000 points:
    signal = signal[:20000]
    v = np.hstack([
        np.ones(signal.shape),
        np.ones(signal.shape) * -1
    ])
    conv = np.convolve(signal, v, mode='valid')
    polya_start = argrelextrema(conv,
                                np.greater,
                                order=start_max_order)[0][1]
    polya_start = int(polya_start)
    polya_end_candidates = argrelextrema(conv,
                                         np.less,
                                         order=end_min_order)[0]
    polya_end_idx = np.searchsorted(polya_end_candidates, polya_start)
    try:
        polya_end = polya_end_candidates[polya_end_idx]
    except IndexError:
        polya_end = polya_end_candidates[polya_end_idx - 1]
    return polya_end, conv
```


![polyA detection]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_5_0.png)


In Matt Loose’s nature methods paper, he used a time series alignment technique called [Dynamic Time Warping](https://en.wikipedia.org/wiki/Dynamic_time_warping) (DTW) to align event segmented signals from the MinION to “reference squiggles”, i.e. predicted signals for a given kmer of interest produced from the Hidden Markov Models that ONT used to use to decode the sequenced signals. More recently, however, ONT have moved to predicting sequences from raw signal using Recurrent Neural Networks and no longer use either event segmentation or HMMs. It is somewhat more difficult to get an idealised reference signal out of an RNN, therefore we decided to use DTW to cluster related sequences and average them together to build references.

DTW has a time complexity of O(N^2) for two sequences of length N, and so can be pretty slow if the sequences are too long. We found a pretty fast implementation that uses Numba for speed in the music analysis package [LibRosa](https://github.com/librosa/librosa), however even so we decided to smooth and resample the 3000 point long signals to 150 points. This captures most of the variation in the signal but significantly reduces the computation required for DTW.



```python

from scipy.signal import medfilt, resample

def crop_and_resample_signal(signal, polya_end_idx,
                             crop_size, filter_size, resample_size):
    cropped = signal[polya_end_idx: polya_end_idx + crop_size]
    smoothed = medfilt(cropped, filter_size)
    resampled = resample(smoothed, resample_size)
    return resampled
```

![resample size]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_8_0.png)

![filter size]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_9_0.png)

Dynamic Time Warping actually seems like a pretty similar algorithm to Needleman Wunsch or Smith Waterman alignment, which are used for matching genetically similar DNA sequences. Like them, it also uses a cost matrix and backtracking to determine the best path for alignment. Where it differs, however, is that it doesn't penalise scores for opening up gaps, i.e. consuming part of one time series without consuming an equal part of the other. This can be seen in the example below where a large flat part of the orange signal maps to pretty much a single point on the blue signal.

![dtw]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_10_0.png)

Using DTW as the metric, we produced pairwise distances of our resampled signals and visualised them using heatmaps and tSNE. We found that whilst these resampled signals were a bit noisy, they seemed to cluster pretty well!


```python
from scipy.spatial.distance import pdist, squareform
from librosa.core import dtw

def _dtw(X, Y):
    mat = dtw(
        X, Y,
        backtrack=False
    )
    return mat[-1, -1]


def dtw_pdist(X):
    dists = pdist(X, metric=_dtw)
    dists = squareform(dists)
    return dists


signal_cropped = []
for sig in signals:
    poly_a, _ = find_polyA(sig)
    sig_c = crop_and_resample_signal(sig, poly_a,
                                     crop_size=3000,
                                     filter_size=51,
                                     resample_size=150)
    signal_cropped.append(sig_c)
signal_cropped = np.asarray(signal_cropped)
dists = dtw_pdist(signal_cropped)
```

![heatmap and tsne]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_13_0.png)


NB This was about as far as well got on the weekend of the hackathon (I think I bit off a bit more than I could chew with this project), but I carried on with it the next weekend. The next few results are from that session:

There were a few clear outliers visible in the tSNE plot and heatmaps, which I think occur where the polyA detection method failed for whatever reason. Because we wanted to use the data to train a model, we thought it might be a good idea to try and remove these outliers. To do this we used edited nearest neighbours. This data cleaning method checks to see if the nearest neighbours of each signal in the training data are of the same class as that signal. If not enough are, then the point is removed from the filtered dataset. This is used for cleaning the decision boundaries in datasets, particularly if a synthetic oversampling method such as SMOTE has been used. We can see from the tSNE that after using ENN, most of the outlying points in the tSNE scatterplot are gone.


```python

from scipy.stats import mode

def edited_nearest_neighbours(dists, labels, k):
    dists = dists.copy()
    diag = np.eye(*dists.shape).astype(bool)
    dists[diag] = np.inf
    filtered_idx = []
    for i, row in enumerate(dists):
        label = labels[i]
        neighbour_idx = np.argsort(row)[:k]
        neighbours = labels[neighbour_idx]
        if mode(neighbours)[0] == label:
            filtered_idx.append(i)
    return filtered_idx, labels[filtered_idx]

idx, filtered_transcript_codes = edited_nearest_neighbours(dists, transcript_codes, k=10)
dists_enn = dists[idx][:, idx]
```

![heatmap and tsne after enn]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_17_0.png)


Time series clustering studies have produced a number of different methods for producing models using DTW as the distance metric. A lot of these are pretty complex and aim to reduce the number of DTW operations that need to be performed per new query. Since we only have approximately 50 kmers from which time series arise, we used a method called [DTW Barycenter Averaging](https://pdfs.semanticscholar.org/a596/8ca9488199291ffe5473643142862293d69d.pdf) (DBA) to produce averaged signals for reads coming from the same transcript. New data can then be compared to each of these averaged signals, and new classes assigned by distance. This method requires a lot of computation up front to align and average the training data, but a maximum of only 50 DTW operations per signal at testing time.

DBA works basically by picking the medoid time series in the group, then updating it by aligning all the other time series to it with DTW and averaging the alignments at each point. This updating is done iteratively until the averaged time series converges to some optimum average.


```python
def medoid(X):
    dists = squareform(pdist(X, metric='euclidean'))
    dist_sum = dists.sum(0)
    m = X[dist_sum.argmin()]
    return m

def _update_dba(t, X):
    t_update = np.zeros_like(t)
    t_count = np.zeros_like(t)
    for x in X:
        _, path = dtw(t, x, backtrack=True)
        for i, j in path:
            t_update[i] += x[j]
            t_count[i] += 1
    t_update /= t_count
    return np.asarray(t_update)

def dba(X, n_iter=20, tol=0.05):
    t = medoid(X)
    for _ in range(n_iter):
        t_update = _update_dba(t, X)
        if np.allclose(t, t_update, 0.05):
            return t_update
        else:
            t = t_update
    return t
```

![dba]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_20_0.png)


You can kind of see above how the DBA finds its way from the starting medoid to the final signal. Once we have averaged signals for each transcript cluster, we can try using them to make predictions for new input signals. We built a classifier which takes input signals and their transcript labels. It first uses ENN to remove any outlying signals. Then DBA is used to produce a centroid signal for each class. The model compares new signals against all of these centers and outputs the class label of the closest center as a prediction.


```python

from scipy.spatial.distance import cdist

def centroid_dists(X, centers):
    dist_to_centers = cdist(X, centers, metric=_dtw)
    return dist_to_centers


class DTWDBAClassifier():

    def __init__(self, enn=5, n_iter=20):
        self._enn = enn
        self._n_iter = n_iter

    def fit(self, X, y):
        if self._enn:
            dists = dtw_pdist(X)
            idx_filtered, y_filtered = edited_nearest_neighbours(dists, y, self._enn)
            X = X[idx_filtered]
            y = y_filtered
        self._labels = []
        self._dba = []
        for label in np.unique(y):
            self._labels.append(label)
            self._dba.append(dba(X[y == label], n_iter=self._n_iter))
        self._labels = np.array(self._labels)
        self._dba = np.array(self._dba)
        return self

    def predict(self, X):
        dists = centroid_dists(X, self._dba)
        p = dists.argmin(1).astype('i')
        return self._labels[p], dists.min(1)


model = DTWDBAClassifier()
model.fit(train_signals, train_transcript_codes)

y_pred, y_dists = model.predict(test_signals)
```

![confusion matrix]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_26_0.png)

The model works! It is pretty decent at assigning reads arising from each of the 50 genes used to train it to the correct class. This is all very well, but we don’t really care that much during sequencing which specific transcript a read came from. All we are interested in is whether the read is from a gene we want to sequence, or one that we don’t. We therefore picked out a bunch of reads that came from other transcripts, and looked to see if the minimum DTW distances produced by the model were significantly higher than those produced for the reads we care about:

![keep or reject]({{ site.url }}{{ site.baseurl }}/assets/images/read_until/output_31_0.png)

The answer is: yes... Reads from other transcripts do on average produce higher minimum distances, however the overlap is still a bit too great to produce a decision boundary that separates them well, as shown by the pretty rubbish looking ROC curve. There are several ways that we could hopefully improve this. The most obvious is to use more input signal. This is not ideal however, since this would require more sequencing time wasted per uninteresting read, and more time required for processing of the signal. The second is maybe a bit of parameter tweaking: we might get some improvement by changing the smoothing or resampling methods used to produce the alignable sequence. The third is not to use DTW at all, and basecall sequences before trying to predict what they are, which is [apparently what ONT have decided to do…](https://nanoporetech.com/resource-centre/talk/evolution-minion-selective-sequencing-read-until-basecall-and-reference)  Oh well, we tried!
