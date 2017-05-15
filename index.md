---
layout: single
author_profile: true
header:
  image: /assets/images/banner.jpg
---

## Some blog posts I wrote:

{% for post in site.posts %}
  <a href="{{ post.url }}">{{ post.title }}</a>
  {{ post.excerpt }}
{% endfor %}
