---
title: "Solving Nonogram QR Codes"
layout: single
header:
  image: /assets/images/nonograms/nonogram_hello_world.png
  teaser: /assets/images/nonograms/nonogram_hello_world.png
read_time: false
comments: true
share: true
related: true
excerpt: "Can the previously generated nonograms be solved?"
tags: [qrcode, nonogram, matplotlib]
---

I previously wrote a post demonstrating some code to generate Nonograms from QR codes. This was based on a puzzle posted online by GCHQ, which I had used to make a puzzle challenge for my departments PhD student retreat. In the post I added two new nonograms, one based on the string "Hello World", and another based on a URL which I did not disclose (thats the whole fun of it!). I did not bother trying to solve these myself, however, and someone has pointed out to me that they may have multiple solutions.

To test this I wrote a brute force solver. It works by evaluating all the possible patterns which would satisfy each row, and seeing which squares are always shaded or unshaded. These are then filled in. The same is then done for the columns. Each time some squares are filled in on the rows, it reduces the number of possible patterns which could be used on the columns. Shading in columns also reduces the possibilities for rows too. By this method we can iteratively start to fill in all the squares.

If my thinking is correct, if there is only one solution to the puzzle we should always find it this way. If there are multiple solutions, however, we will eventually converge to a point at which more iterations do not fill in any more squares. This means there are several valid answers to a puzzle.

Lets first try the "Hello World" example. Grey represent ambiguous squares, whilst white squares are known to be empty and black squares are known to be shaded:

```python
qr_ = qr_matrix('Hello World') 
rows, cols = run_length_encode(qr_) # see the first blog post for how this function works
qr = qr_[1:-1, 1:-1] # remove padding from qr code
shape = qr.shape

# time to run our brute-force solver...
solved, ambig = solve_nonogram(rows, cols, shape=shape, plot_progress=True)
```

![Hello World Solution]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/hello_world_solution_ambig.gif)

So it turns out that the Hello World nonogram actually has multiple solutions! this doesn't seem to prevent it from working as a QR code - even the version above with the grey boxes scans and returns the input string correctly - but thats not really the point, is it? It's not very satisfying if we can't end up with one solution.

It's pretty easy to guarantee that we do, however, with only a couple of small changes. Instead of drawing the nonogram as an empty grid, we can identify the ambiguous squares and pre-fill them. Our QR -> nonogram function can be edited as follows:

```python
def nonogram_qr_2(data):
    qr = qr_matrix(data)
    qr_unpadded = qr[1:-1, 1:-1]
    row_rle, col_rle = run_length_encode(qr)
    shape = qr_unpadded.shape
    solved, ambig = solve_nonogram(row_rle, col_rle,
                                   shape=shape,
                                   plot_progress=False)
    unambig_start = np.full_like(solved, -1)
    if ambig:
        unambig_start[solved == -1] = qr_unpadded[solved == -1]
        unambig_start[unambig_start == 0] = -1
    return shape, row_rle, col_rle, unambig_start
```

And our drawing function like so:

```python
def draw_nonogram_2(shape, row_rle, col_rle, matrix=None):
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

    if matrix is not None:
        for i, j in np.argwhere(matrix == 1):
            ax.add_patch(Rectangle(xy=(j, -i - 1), width=1, height=1, color='k'))
    # adjust x and y limits
    lim_left = max([len(x) for x in row_rle + col_rle]) + 1
    lim_right = max(r, c) + 1
    ax.set_xlim(-lim_left, lim_right)
    ax.set_ylim(-lim_right, lim_left)
    return ax
```

Now our newly-unambiguous nonograms look like this:

```python
shape, row_rle, col_rle, start_matrix = nonogram_qr_2('Hello World')
draw_nonogram_2(shape, row_rle, col_rle, start_matrix)
plt.show()
```

![Hello World Nonogram]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/nonogram_hello_world_unambig.png)

And they only result in a single solution:

```python
solve_nonogram(row_rle, col_rle, mat=start_matrix, plot_progress=True)
```

![Hello World Solution 2]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/hello_world_solution_unambig.gif)

Finally, it turns out that the second, larger Nonogram I posted may also have been ambiguous (oops). Here it another with only one possible answer. The prize for working it out is still the same...

![Secret Nonogram]({{ site.url }}{{ site.baseurl }}/assets/images/nonogram/nonogram_secret_unambig.png)
