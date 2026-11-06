"""引擎核心纯函数回归（无网络、无浏览器）。"""
import os

import crawl_weread
import export_book


# ---------- extract_book_id ----------

def test_extract_book_id_from_reader_url():
    assert crawl_weread.extract_book_id("https://weread.qq.com/web/reader/3b132980813ab94eeg013129") == "3b132980813ab94eeg013129"


def test_extract_book_id_from_detail_url():
    assert crawl_weread.extract_book_id("https://weread.qq.com/web/bookDetail/abc123def456") == "abc123def456"


def test_extract_book_id_plain():
    assert crawl_weread.extract_book_id("3b132980813ab94eeg013129") == "3b132980813ab94eeg013129"


def test_extract_book_id_with_query():
    assert crawl_weread.extract_book_id("https://weread.qq.com/web/reader/abc123?source=share") == "abc123"


def test_extract_book_id_invalid_short():
    # 过短字符串不匹配 ID 规则时回退为原文清理
    assert crawl_weread.extract_book_id("ab") == "ab"


def test_extract_book_id_empty():
    assert crawl_weread.extract_book_id("") == ""


# ---------- cls_of / 样式分级 ----------

def test_cls_of_title():
    assert crawl_weread.cls_of('24.8px "PingFang SC"') == "title"


def test_cls_of_quote():
    assert crawl_weread.cls_of('21.5px serif') == "yw"


def test_cls_of_bold():
    assert crawl_weread.cls_of('16px bold sans') == "fang"


def test_cls_of_body():
    assert crawl_weread.cls_of('16px sans') == "js"


# ---------- split_pages / page_lines ----------

def _char(t, x, y, f="16px sans", side=0, seq=0):
    return {"t": t, "x": x, "y": y, "f": f, "side": side, "seq": seq}


def test_split_pages_by_seq():
    chars = [_char("一", 100, 100, seq=0), _char("二", 120, 100, seq=0), _char("三", 100, 100, seq=1)]
    pages = crawl_weread.split_pages(chars)
    assert len(pages) == 2
    assert "".join(c["t"] for c in pages[0][1]) == "一二"
    assert "".join(c["t"] for c in pages[1][1]) == "三"


def test_split_pages_filters_measure_text():
    chars = [_char("正文", 100, 100), _char("abcdefghijklm", 300, 100)]
    pages = crawl_weread.split_pages(chars)
    assert "".join(c["t"] for c in pages[0][1]) == "正文"


def test_page_lines_group_rows_and_merge_titles():
    chars = [
        _char("第一章", 100, 100, f="25px bold"),
        _char("起始", 200, 100, f="25px bold"),
        _char("正文一行。", 100, 160),
    ]
    lines = crawl_weread.page_lines(chars)
    assert lines[0]["cls"] == "title"
    assert lines[0]["text"] == "第一章起始"
    assert lines[1]["cls"] == "js"


# ---------- match_catalog_title ----------

CATALOG = ["第一章 起点", "第二章 转折"]


def test_match_catalog_exact():
    title, rest = crawl_weread.match_catalog_title("第二章 转折", CATALOG, set())
    assert title == "第二章 转折"
    assert rest == ""


def test_match_catalog_glued():
    title, rest = crawl_weread.match_catalog_title("第二章 转折这一天来得很快。", CATALOG, {"第一章 起点"})
    assert title == "第二章 转折"
    assert rest.startswith("这一天")


def test_match_catalog_seen_skipped():
    title, rest = crawl_weread.match_catalog_title("第一章 起点", CATALOG, {"第一章 起点"})
    assert title is None


# ---------- render_md ----------

def test_render_md_blocks_and_images():
    blocks = [
        {"type": "line", "cls": "js", "text": "他想着心事。"},
        {"type": "img", "src": "https://res.weread.qq.com/wrepub/epub_x_1.jpg"},
        {"type": "line", "cls": "yw", "text": "引文内容。"},
    ]
    body, imgs = crawl_weread.render_md("测试章", blocks, 1)
    assert "# 测试章" in body
    assert "![图](images/ch0001_img01.jpg)" in body
    assert '<p class="yw">引文内容。</p>' in body
    assert imgs == [{"src": "https://res.weread.qq.com/wrepub/epub_x_1.jpg", "name": "ch0001_img01.jpg"}]


# ---------- refine_chapter_text ----------

def test_refine_merges_broken_sentence():
    # refine 层合并以 ，、；—— 结尾的跨段断句（句号内断句由抓取层 render_md 合并）
    md = "# 章\n\n他想着心事，\n\n继续说道。"
    out = export_book.refine_chapter_text(md)
    assert "他想着心事，继续说道。" in out


def test_refine_keeps_paragraph_break():
    md = "# 章\n\n第一段完整结束。\n\n第二段开始。"
    out = export_book.refine_chapter_text(md)
    assert "第一段完整结束。\n\n第二段开始。" in out


# ---------- protocol ----------

def test_protocol_envelope_shape():
    from engine import protocol
    env = protocol.envelope("task.progress", {"page": 1}, task_id="t1")
    assert env["protocol_version"] == 1
    assert env["event"] == "task.progress"
    assert env["task_id"] == "t1"
    assert env["timestamp"]


def test_protocol_parse_command_garbage():
    from engine import protocol
    assert protocol.parse_command("not json") is None
    assert protocol.parse_command("") is None
    assert protocol.parse_command('{"cmd":"ok"}') == {"cmd": "ok"}


# ---------- output_dir 参数化（不触碰真实 output/） ----------

def test_rebuild_and_read_book_in_custom_dir(tmp_path):
    import json

    book_id = "testbook123456"
    book_dir = tmp_path / f"{book_id}_v2"
    (book_dir / "raw").mkdir(parents=True)
    (book_dir / "chapters").mkdir(parents=True)
    page = {"step": 0, "chapter": "第一章", "words": 10, "blocks": [{"type": "line", "cls": "js", "text": "这是第一章的内容。"}]}
    (book_dir / "raw" / "page_0000.json").write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")

    cnt = crawl_weread.rebuild_chapters_from_raw(book_id, output_dir=str(tmp_path))
    assert cnt == 1
    assert (book_dir / "chapters" / "0001.md").exists()

    root, texts = export_book.read_book(book_id, output_dir=str(tmp_path))
    assert root == str(book_dir)
    assert len(texts) == 1
    assert "第一章" in texts[0]
