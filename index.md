---
layout: home
author_profile: true
header:
  image: /assets/images/banner.jpg
---

{% for post in site.posts %}
  <a href="{{ post.url }}">{{ post.title }}</a>
  {{ post.excerpt }}
{% endfor %}