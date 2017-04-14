---
title: "Producing context similarity vectors for Protein and DNA sequences"
layout: single
excerpt: "Using Word2Vec to analyse codon contexts"
tags: [Word2Vec, codon usage, genomics]
---

I saw a list of [ML applications in Biology](https://github.com/hussius/deeplearning-biology) on twitter the other day, but I didn't get very far into reading it because I immediately got interested in one of the papers at the [top of the list](http://journals.plos.org/plosone/article?id=10.1371/journal.pone.0141287). It was about representing DNA and protein sequences as vectors produced by analysing their contexts using the skip gram word2vec method. I had never heard of skip grams or word2vec so I went and looked it up and found [this great explanation](http://mccormickml.com/2016/04/19/word2vec-tutorial-the-skip-gram-model/) by Chris McCormick. Essentially the skip gram uses a neural network with one hidden layer to produce probabilities for what the adjacent words will be. Pretty cool. And then I found [gensim](https://radimrehurek.com/gensim/), a python library which implements the word2vec method in an easy to use way. All this made me want to have a go myself, so I'm starting by trying to reproduce/mimic some of the figures from the Asgari paper, using the *Arabidopsis* proteome and transcriptome.


```python
# Lots and lots of imports
import re
import itertools as it
from collections import Counter

import numpy as np
from matplotlib import pyplot as plt
from matplotlib.colors import Normalize
plt.style.use('ggplot')

from sklearn.decomposition import PCA
import networkx as nx
from gensim.models import Word2Vec
from Bio.SeqIO import parse
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from Bio.SeqUtils.CodonUsage import SynonymousCodons as syn_codons
```
  

First I'm going to parse all of the tripeptides from all the proteins of the Araport11 proteome. In the paper they looked at all three phases but I'm just gonna use the first here.


```python
peps_count = Counter()
peps = []
for record in parse('./Desktop/Araport11_genes.201606.pep.fasta', 'fasta'):
    seq = str(record.seq)
    for i in (0, 1, 2):
        tripeps = re.findall('...', seq)
        peps.append(tripeps)
        peps_count.update(tripeps)

p = [x[0] for x in peps_count.most_common() if x[1] >= 10]
```

Then we can use Word2Vec to create context vectors for each tripeptide, using a window of 10 adjacent 'words', and 100 hidden layer neurons


```python
pep_w2v = Word2Vec(peps, size=100, window=10, min_count=10)
```

In the Asgari paper, they calculated MW, aromaticity, and some other properties for the peptides, then used dimensionality reduction to squash the vectors into 2D and look at the distribution of these properties over the vectors. We can do similar (although with not quite the same properties) pretty easily using a mixture of Biopython (finally found a use for SeqUtils!), and sklearn.


```python
def get_attrb(pep, func):
    try:
        return func(pep)
    except ValueError:
        # Ambiguous IUPAC code, can't calculate the property
        return np.nan

vectors = [pep_w2v.wv[seq] for seq in p]
decomp = PCA(n_components=2).fit_transform(vectors)

# Produce some stats for the tripeptides
peps_anal = [ProteinAnalysis(seq) for seq in p]
mw = [get_attrb(pa, ProteinAnalysis.molecular_weight) for pa in peps_anal]
iso = [get_attrb(pa, ProteinAnalysis.isoelectric_point) for pa in peps_anal]
arom = [get_attrb(pa, ProteinAnalysis.aromaticity) for pa in peps_anal]

# Propensity to form different secondary structures
prop = [get_attrb(pa, ProteinAnalysis.secondary_structure_fraction)
        for pa in peps_anal]
helix, turn, sheet = zip(*prop)
```


```python
fig, axes = plt.subplots(ncols=3, nrows=2, figsize=(15, 10))
properties = [mw, iso, arom, helix, turn, sheet]
titles = ['Molecular Weight',
          'Isoelectric Point',
          'Aromaticity',
          'Helix Propensity',
          'Turn Propensity',
          'Sheet Propensity']
for ax, color, title in zip(axes.flatten(), properties, titles):
    ax.scatter(decomp[:,0], decomp[:,1], c=color, cmap='viridis', s=2)
    ax.set_title(title)
plt.show()
```

![png]({{ site.url }}{{ site.baseurl }}/assets/images/word2vec_images/output_9_0.png)


While the outputs don't look identical to the papers (they are made using an entirely different set of proteins, for one), you can clearly see that tripeptides with similar properties also tend to have similar contexts. Which obviously makes perfect sense.

Now lets look at the trinucleotide contexts of coding regions, i.e. the contexts of in-frame codons. There are fewer different trinucleotides (4**3 = 64) so I figured I'd use fewer neurons for the Word2Vec. I'm just guessing though...


```python
cds_count = Counter()
cds = []
for record in parse('./Desktop/Araport11_genes.201606.cds.fasta', 'fasta'):
    trinucl = re.findall('...', str(record.seq))
    cds.append(trinucl)
    cds_count.update(trinucl)

cds_w2v = Word2Vec(cds, size=50, window=10, min_count=10)
k = [x[0] for x in cds_count.most_common() if x[1] >= 10]
```

The gensim w2v model also has some useful built in features for looking at the most similar "words". For example, we can see which words are found in similar contexts to the stop codon "TGA". What a surprise, the other stop codons "TAA" and "TAG" are far and away the most similar.


```python
cds_w2v.wv.most_similar(positive='TGA', topn=5)
```




    [('TAG', 0.8345359563827515),
     ('TAA', 0.8105002045631409),
     ('CGC', 0.4449400007724762),
     ('TGC', 0.3436795175075531),
     ('CTC', 0.3216622471809387)]



Since there are only 64 trinucleotides in the "corpus", we might be able to draw a network of codon-codon similarities that isn't too messy using networkx.


```python
graph = nx.Graph()
graph.add_nodes_from(k)
for a, b in it.combinations(k, r=2):
    w = cds_w2v.wv.similarity(a, b)
    if w > 0.6:
        graph.add_edge(a, b, weight=w)

fig, ax = plt.subplots(figsize=(10, 10))
ax.set_axis_off()

# use the edge weights to set how fat the line is
widths = Normalize()([d['weight'] for *_, d in graph.edges(data=True)]) * 5

nx.draw_networkx(graph, width=widths)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/word2vec_images/output_15_0.png)


Ok, so it's a bit messy, but we can see some of the interesting features, e.g. the subgraphs made by certain codons. If we want to be more clear, we could just look at subgraphs instead to reduce the complexity. In fact, we could create subgraphs for each group of synonymous codons. Yeah, let's do that.


```python
def draw_graph(codons, threshold, ax=None):
    n = Normalize(threshold-0.1, 1)
    if ax is None:
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.set_axis_off()
    g = nx.Graph()
    for c in codons:
        g.add_node(c)
        for neighbour, weight in cds_w2v.wv.most_similar(c, topn=20):
            if weight > threshold:
                g.add_node(neighbour)
                g.add_edge(c, neighbour, weight=weight)
    w = n([d['weight'] for *_, d in g.edges(data=True)]) * 6
    c = ['red' if x in codons else 'green' for x in g.nodes()]
    nx.draw_networkx(g, width=w, node_size=500, node_color=c, ax=ax)

fig, axes = plt.subplots(figsize=(28, 12), ncols=7, nrows=3)
for ax, aa in zip(axes.flatten(), syn_codons.keys()):
    ax.set_axis_off()
    ax.set_title(aa)
    draw_graph(syn_codons[aa], threshold=0.6, ax=ax)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/word2vec_images/output_17_0.png)


The number of connections shown obviously depends on the threshold value we choose, but to my eye it seems like smallish and aliphatic amino acid encoding codons (e.g. Leucine, Valine, Threonine etc.) have less specialised "contexts", and more connections to codons encoding different things. Cysteine, which is a pretty unique amino acid, also has a pretty unique context. We can also visualise this with a violin plot:


```python
import seaborn as sns
import pandas as pd

dists = []
amino_acids = []
for aa in syn_codons:
    d = np.array([cds_w2v.wv.similarity(cdn, x)
                  for cdn in syn_codons[aa]
                  for x in k if not x==cdn])
    dists.append(d)
    amino_acids.append(np.repeat(aa, len(d)))


dists = np.concatenate(dists)
amino_acids = np.concatenate(amino_acids)
data = pd.DataFrame(list(zip(amino_acids, dists)),
                    columns=['amino acid', 'context similarity'])

fig, ax = plt.subplots(figsize=(15, 5))
order = data.groupby('amino acid').median().sort_values(
    'context similarity').index.values
sns.violinplot(x='amino acid', y='context similarity',
               data=data, bw=0.2, order=order)
plt.show()
```


![png]({{ site.url }}{{ site.baseurl }}/assets/images/word2vec_images/output_19_0.png)


This way of visualising the data gives a slightly different perspective than the networks. We can see that whilst 'ATG', the codon for Methionine, has very few strongly similar codons by context, it has a lot of moderately similar ones, giving it the highest median similarity.  
