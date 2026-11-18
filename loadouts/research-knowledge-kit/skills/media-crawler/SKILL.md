---
name: media-crawler
description: Crawl and extract posts/comments from Xiaohongshu, Douyin, Kuaishou, Bilibili, Weibo, Tieba, and Zhihu using NanmiCoder/MediaCrawler.
---

# MediaCrawler

Use this skill when the user needs structured social-platform data (posts, videos, comments) from Chinese platforms (Xiaohongshu, Douyin, Kuaishou, Bilibili, Weibo, Tieba, Zhihu).

- Upstream repo: https://github.com/NanmiCoder/MediaCrawler
- Check if MediaCrawler is cloned/configured in the workspace or local environment, run via `uv run main.py --platform <xhs|dy|ks|bili|wb|tieba|zhihu> --lt qrcode --type search`, and respect platform rate limits and login states.
