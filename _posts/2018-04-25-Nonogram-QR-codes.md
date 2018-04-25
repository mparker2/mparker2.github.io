---
title: "Nonogram QR Codes"
layout: single
header:
  image: /assets/images/nonograms/nonogram_hello_world.png
  teaser: /assets/images/nonograms/nonogram_hello_world.png
read_time: false
comments: true
share: true
related: true
excerpt: "Making fun puzzles in matplotlib"
tags: [qrcode, nonogram, matplotlib]
---

For there 2015 Christmas puzzle, GCHQ produced a nonogram which hid a QR code that linked to a secret part of their website where the next stage of the challenge was contained. I thought this was pretty awesome, so I wrote some code to produce nonograms for any input text, using matplotlib and a python package called qrcode. Originally I used this to set puzzles for our yearly PhD retreat, but I thought I'd post the code & some examples up here too:

Code:

```python
import numpy as np
import matplotlib.pyplot as plt
import qrcode

def qr_matrix(data):
    qr = qrcode.QRCode(version=1, box_size=1, border=1)
    qr.add_data(data)
    return np.asarray(qr.get_matrix(), dtype = int)

def _rle(matrix):
    # find run start and ends
    d = np.diff(matrix)
    row, start_pos = np.where(d > 0)
    _, end_pos = np.where(d < 0)
    # find run lengths
    run_lengths = end_pos - start_pos
    # split runs from different rows into separate arrays
    split_on = np.cumsum(np.bincount(row - 1))[:-1]
    return np.split(run_lengths, split_on)

def run_length_encode(matrix):
    rle_row = _rle(matrix)
    rle_col = _rle(matrix.T)
    return rle_row, rle_col

def nonogram_qr(data):
    qr = qr_matrix(data)
    row_rle, col_rle = run_length_encode(qr)
    shape = np.array(qr.shape) - 2
    return shape, row_rle, col_rle

def draw_nonogram(shape, row_rle, col_rle):
    fig, ax = plt.subplots(figsize=(10, 10))
    plt.axis('off')
    plt.axis('equal')

    r, c = shape
    # draw the grid for the nonogram:
    for i in range(r + 1):
        ax.plot([0, c], [-i, -i], 'k-')
    for j in range(c + 1):
        ax.plot([j, j], [0, -r], 'k-')

    # draw the numbers onto the grid
    for i, row in enumerate(row_rle):
        for idx, val in enumerate(row[::-1]):
            ax.annotate(xy=(-idx - 0.5, -i - 0.5), s=val, ha='center', va='center')
    for j, col in enumerate(col_rle):
        for idx, val in enumerate(col[::-1]):
            ax.annotate(xy=(j + 0.5, idx + 0.5), s=val, ha='center', va='center')

    # adjust x and y limits
    lim_left = max([len(x) for x in row_rle + col_rle]) + 1
    lim_right = max(r, c) + 1
    ax.set_xlim(-lim_left, lim_right)
    ax.set_ylim(-lim_right, lim_left)
    return ax
```

This can be used to generate a nonogram for any old bit of text data you enter. For example:  

```python
ax = draw_nonogram(*nonogram_qr('Hello World'))
plt.show()
```

Draws the following nonogram:

![Hello World Nonogram]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/nonogram_hello_world.png)

What is cooler though is making a nonogram which encodes a url for a secret website address though. If you can solve this one, you are a winner!  

![Secret Nonogram]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/nonogram_secret.png)
