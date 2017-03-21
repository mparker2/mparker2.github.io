---
layout: single
author_profile: true
title: All Posts
---

{% for post in site.posts %}
  <a href="{{ post.url }}">{{ post.title }}</a>
  {{ post.excerpt }}
{% endfor %}