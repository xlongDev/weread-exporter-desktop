"""划线/想法导出（纯 HTTP，无需抓页；2026-11-19 实测端点，均只读）。

- 划线  GET https://weread.qq.com/web/book/bookmarklist?bookId=
        → updated[].markText/chapterUid + chapters[].title 章节映射
- 想法  GET https://weread.qq.com/web/review/list?bookId=&listType=11&listMode=2
        &count=0&maxIndex=0&userVid=<wr_vid cookie>
        （userVid 缺失返回 -2003「参数格式错误」；hasMore=1 时用回包 synckey 续传）
"""
import json
import urllib.request

BOOKMARK_URL = "https://weread.qq.com/web/book/bookmarklist"
REVIEW_URL = "https://weread.qq.com/web/review/list"


def _http_get_json(url, cookies, timeout=20):
    """带 weread cookie 的 GET；失败抛异常由调用方统一处理。"""
    cookie_hdr = "; ".join(f"{c['name']}={c['value']}" for c in cookies if "weread" in c.get("domain", ""))
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://weread.qq.com/",
        "Cookie": cookie_hdr,
    })
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace"))


def parse_bookmarklist(data):
    """划线回包 → [{chapter_uid, text, range, create_time}]（跳过空文本）。"""
    out = []
    for b in (data or {}).get("updated") or []:
        text = (b.get("markText") or "").strip()
        if not text:
            continue
        out.append({
            "chapter_uid": b.get("chapterUid"),
            "text": text,
            "range": b.get("range") or "",
            "create_time": b.get("createTime") or 0,
        })
    return out


def parse_chapters(data):
    """章节映射 {chapterUid: title}（划线按章节分组的依据；无 UID 条目跳过）。"""
    return {c.get("chapterUid"): (c.get("title") or "").strip()
            for c in (data or {}).get("chapters") or []
            if c.get("chapterUid") is not None}


def parse_reviews(data):
    """想法回包 → [{content, chapter_name, create_time, star}]（章节想法在前，整本书评 chapter_name 为空）。"""
    out = []
    for item in (data or {}).get("reviews") or []:
        r = item.get("review") or item
        content = (r.get("content") or "").strip()
        if not content:
            continue
        out.append({
            "content": content,
            "chapter_name": (r.get("chapterName") or "").strip(),
            "create_time": r.get("createTime") or 0,
            "star": r.get("star") if r.get("star") is not None else -1,
        })
    return out


def fetch_notes_http(cookies, book_id, get_json=None, review_book_id=None):
    """拉取单本书的划线 + 想法（想法按 synckey 翻页，上限 20 页防死循环）。
    双 ID 体系：划线端点 bookmarklist 对 v-hash 与数字 ID 都接受；
    想法端点 review/list 只认数字 bookId（v-hash 报 -2003，2026-11-20 实测），
    因此调用方应经 review_book_id 传入数字 ID（书架卡片自带 / bookDetail 页提取），缺省用 book_id。
    想法端点报 -2003（无法定位书）时降级为仅划线；其余 errCode（登录失效等）返回 None。
    返回 {"highlights": [...], "chapters": {...}, "reviews": [...]}；
    登录失效（errCode）或网络失败返回 None。get_json 可注入用于测试。"""
    _get = get_json or _http_get_json
    rv_id = review_book_id or book_id
    try:
        bm = _get(f"{BOOKMARK_URL}?bookId={book_id}", cookies)
        if "errCode" in bm:
            return None
        highlights = parse_bookmarklist(bm)
        chapters = parse_chapters(bm)
        reviews = []
        synckey = 0
        for _ in range(20):
            rv = _get(f"{REVIEW_URL}?bookId={rv_id}&listType=11&listMode=2&count=0&maxIndex=0&userVid="
                      f"{next((c['value'] for c in cookies if c['name'] == 'wr_vid'), '')}&synckey={synckey}", cookies)
            if "errCode" in rv:
                if rv.get("errCode") == -2003:
                    break  # 该书无法用现有 ID 拉想法：划线仍可导出
                return None
            reviews.extend(parse_reviews(rv))
            if not rv.get("hasMore"):
                break
            synckey = rv.get("synckey") or 0
    except Exception:
        return None
    book = bm.get("book") or {}
    return {
        "highlights": highlights,
        "chapters": chapters,
        "reviews": reviews,
        # bookmarklist 自带的书籍信息（老式短 ID 的 bookDetail 页 404 时兜底）
        "title": (book.get("title") or "").strip(),
        "author": (book.get("author") or "").strip(),
    }


def render_notes_body(highlights, chapters, reviews, level=2):
    """划线按章节分组（保持出现顺序）+ 想法列表；level 为章节/想法标题层级。
    单书笔记与多书划线汇总共用（汇总时章节降一级为 ###）。"""
    grouped, idx = [], {}
    for h in highlights:
        if h["chapter_uid"] not in idx:
            idx[h["chapter_uid"]] = len(grouped)
            grouped.append((h["chapter_uid"], []))
        grouped[idx[h["chapter_uid"]]][1].append(h["text"])
    lines = []
    for i, (uid, texts) in enumerate(grouped):
        lines += [f"{'#' * level} {chapters.get(uid) or f'章节 {uid if uid is not None else i}'}", ""]
        for t in texts:
            lines += [f"> {t}", ""]
    if reviews:
        lines += [f"{'#' * level} 想法", ""]
        for r in reviews:
            lines += [f"- {'【' + r['chapter_name'] + '】' if r['chapter_name'] else ''}{r['content']}", ""]
    return lines


def render_notes_md(title, author, highlights, chapters, reviews, book_id):
    """渲染笔记 Markdown：划线按章节分组（保持出现顺序），想法附章节名；无章节映射时回退「章节 N」。"""
    lines = [f"# {title}", ""]
    if author:
        lines += [f"> {author}", ""]
    lines += [f"导出自微信读书 · 划线 {len(highlights)} 条 · 想法 {len(reviews)} 条", "", "---", ""]
    lines += render_notes_body(highlights, chapters, reviews)
    return "\n".join(lines).rstrip() + "\n"


def render_summary_md(books, when=""):
    """多本书划线汇总（类 Readwise）：每本书一个 h2 小节。books 仅含确有划线/想法的条目，
    各条目为 fetch_notes_http 回包（highlights/chapters/reviews/title/author）。"""
    total_h = sum(len(b["highlights"]) for b in books)
    total_r = sum(len(b["reviews"]) for b in books)
    head = "导出自微信读书" + (f" · {when}" if when else "")
    lines = ["# 划线汇总", "", f"{head} · 书 {len(books)} 本 · 划线 {total_h} 条 · 想法 {total_r} 条", "", "---", ""]
    for b in books:
        lines += [f"## 《{b['title']}》", ""]
        if b.get("author"):
            lines += [f"> {b['author']}", ""]
        lines += [f"划线 {len(b['highlights'])} 条 · 想法 {len(b['reviews'])} 条", "", "---", ""]
        lines += render_notes_body(b["highlights"], b["chapters"], b["reviews"], level=3)
        lines += [""]
    return "\n".join(lines).rstrip() + "\n"
