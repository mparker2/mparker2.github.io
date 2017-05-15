---
layout: single
author_profile: true
title: All Posts
---

{% for post in site.posts %}
  <a href="{{ post.url }}">{{ post.title }}</a>
  <br/>
  {{ post.excerpt }}
{% endfor %}
