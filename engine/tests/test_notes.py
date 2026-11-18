"""划线/想法导出（notes.py）纯函数与 HTTP 分页回归（无网络、无浏览器）。"""
import notes


# ---------- parse_bookmarklist / parse_chapters ----------

def test_parse_bookmarklist_maps_fields_and_skips_empty():
    data = {"updated": [
        {"bookmarkId": "b1", "chapterUid": 3, "markText": " 第一段划线 ", "range": "3-100-200", "createTime": 1700000000},
        {"bookmarkId": "b2", "chapterUid": 4, "markText": "", "range": "4-0-9"},
        {"bookmarkId": "b3", "chapterUid": 4},
    ]}
    rows = notes.parse_bookmarklist(data)
    assert rows == [{
        "chapter_uid": 3, "text": "第一段划线", "range": "3-100-200", "create_time": 1700000000,
    }]


def test_parse_chapters_maps_uid_to_title():
    data = {"chapters": [{"chapterUid": 1, "title": "第一章"}, {"chapterUid": 2, "title": " 第二章 "}, {"title": "无UID"}]}
    assert notes.parse_chapters(data) == {1: "第一章", 2: "第二章"}


# ---------- parse_reviews ----------

def test_parse_reviews_unwraps_review_and_skips_empty():
    data = {"reviews": [
        {"review": {"reviewId": "r1", "content": " 章节想法 ", "chapterName": "第一章", "createTime": 1700000001, "star": 5}},
        {"review": {"reviewId": "r2", "content": "", "chapterName": "x"}},
        {"reviewId": "r3", "content": "整本书评", "chapterName": "", "star": None},
    ]}
    rows = notes.parse_reviews(data)
    assert rows[0] == {"content": "章节想法", "chapter_name": "第一章", "create_time": 1700000001, "star": 5}
    assert len(rows) == 2
    assert rows[1] == {"content": "整本书评", "chapter_name": "", "create_time": 0, "star": -1}


# ---------- fetch_notes_http（注入 get_json，无真实网络） ----------

def _fake_get_json(pages):
    calls = []

    def get(url, cookies):
        calls.append(url)
        return pages[min(len(calls) - 1, len(pages) - 1)]

    return get, calls


def test_fetch_notes_http_combines_highlights_and_reviews():
    bm = {"updated": [{"chapterUid": 1, "markText": "划线一"}], "chapters": [{"chapterUid": 1, "title": "第一章"}]}
    rv = {"reviews": [{"review": {"content": "想法一", "chapterName": "第一章"}}], "hasMore": 0}
    get, calls = _fake_get_json([bm, rv])
    cookies = [{"name": "wr_vid", "value": "123", "domain": ".weread.qq.com"}]
    out = notes.fetch_notes_http(cookies, "821366", get_json=get)
    assert out == {"highlights": [{"chapter_uid": 1, "text": "划线一", "range": "", "create_time": 0}],
                   "chapters": {1: "第一章"},
                   "reviews": [{"content": "想法一", "chapter_name": "第一章", "create_time": 0, "star": -1}],
                   "title": "", "author": ""}
    assert "userVid=123" in calls[1] and "synckey=0" in calls[1]


def test_fetch_notes_http_book_info_fallback():
    bm = {"updated": [], "chapters": [], "book": {"title": "三体", "author": "刘慈欣"}}
    rv = {"reviews": [], "hasMore": 0}
    get, _ = _fake_get_json([bm, rv])
    out = notes.fetch_notes_http([], "821366", get_json=get)
    assert out["title"] == "三体" and out["author"] == "刘慈欣"


def test_fetch_notes_http_paginates_reviews_by_synckey():
    bm = {"updated": [], "chapters": []}
    page1 = {"reviews": [{"review": {"content": "p1"}}], "hasMore": 1, "synckey": 99}
    page2 = {"reviews": [{"review": {"content": "p2"}}], "hasMore": 0}
    get, calls = _fake_get_json([bm, page1, page2])
    out = notes.fetch_notes_http([{"name": "wr_vid", "value": "1", "domain": ".weread.qq.com"}], "b", get_json=get)
    assert [r["content"] for r in out["reviews"]] == ["p1", "p2"]
    assert "synckey=99" in calls[2]


def test_fetch_notes_http_err_code_returns_none():
    get, _ = _fake_get_json([{"errCode": -2010}])
    assert notes.fetch_notes_http([], "b", get_json=get) is None


def test_fetch_notes_http_network_error_returns_none():
    def boom(url, cookies):
        raise OSError("down")
    assert notes.fetch_notes_http([], "b", get_json=boom) is None


# ---------- render_notes_md ----------

def test_render_notes_md_groups_by_chapter_in_order():
    highlights = [
        {"chapter_uid": 2, "text": "甲", "range": "", "create_time": 0},
        {"chapter_uid": 1, "text": "乙", "range": "", "create_time": 0},
        {"chapter_uid": 2, "text": "丙", "range": "", "create_time": 0},
    ]
    md = notes.render_notes_md("书名", "作者", highlights, {1: "第一章", 2: "第二章"}, [], "bid")
    lines = md.splitlines()
    assert lines[0] == "# 书名" and "> 作者" in md
    assert "划线 3 条 · 想法 0 条" in md
    i1, i2 = lines.index("## 第二章"), lines.index("## 第一章")
    assert i1 < i2  # 按出现顺序分组
    assert md.index("> 甲") < md.index("> 丙") < md.index("> 乙")


def test_render_notes_md_chapter_fallback_and_reviews():
    highlights = [{"chapter_uid": 7, "text": "无映射划线", "range": "", "create_time": 0}]
    reviews = [
        {"content": "章节想法", "chapter_name": "第二章", "create_time": 0, "star": -1},
        {"content": "整本书评", "chapter_name": "", "create_time": 0, "star": -1},
    ]
    md = notes.render_notes_md("书名", "", highlights, {}, reviews, "bid")
    assert "## 章节 7" in md and "> 无映射划线" in md
    assert "## 想法" in md
    assert "- 【第二章】章节想法" in md
    assert "- 整本书评" in md
    assert "作者" not in md  # 空作者不输出引用行
