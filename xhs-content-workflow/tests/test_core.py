import csv
import json
import tempfile
import unittest
from pathlib import Path

from xhs_workflow.automation import ReviewRejected, auto_publish_package
from xhs_workflow.claude_client import extract_json_object
from xhs_workflow.generate import build_generation_prompt
from xhs_workflow.images import build_gemini_command, write_gemini_prompts
from xhs_workflow.metrics import calculate_rates, summarize_metrics
from xhs_workflow.packages import (
    PublishPackage,
    extract_package_fields,
    write_publish_package,
)
from xhs_workflow.publish import (
    build_publish_command,
    prepare_publish_files,
    update_publish_status,
)
from xhs_workflow.prompts import render_prompt
from xhs_workflow.topics import load_topics


class PromptTests(unittest.TestCase):
    def test_render_prompt_replaces_named_placeholders_without_touching_json_braces(self):
        template = """账号：{brand_guide}
输出 JSON:
{
  "titles": ["标题1"],
  "topic": "{topic}"
}
"""

        rendered = render_prompt(
            template,
            {
                "brand_guide": "真实、具体",
                "topic": "新手如何选择第一台咖啡机",
            },
        )

        self.assertIn("账号：真实、具体", rendered)
        self.assertIn('"titles": ["标题1"]', rendered)
        self.assertIn('"topic": "新手如何选择第一台咖啡机"', rendered)

    def test_build_generation_prompt_combines_docs_and_topic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir()
            (root / "prompts").mkdir()
            (root / "docs" / "brand_guide.md").write_text("账号定位", encoding="utf-8")
            (root / "docs" / "content_pillars.md").write_text("内容栏目", encoding="utf-8")
            (root / "docs" / "compliance_rules.md").write_text("合规规则", encoding="utf-8")
            (root / "prompts" / "generate_note.md").write_text(
                "品牌：{brand_guide}\n栏目：{content_pillars}\n规则：{compliance_rules}\n选题：{topic}",
                encoding="utf-8",
            )

            prompt = build_generation_prompt(
                root,
                {
                    "topic": "咖啡机选择",
                    "category": "家居生活",
                    "audience": "租房女生",
                    "angle": "避坑",
                },
            )

        self.assertIn("品牌：账号定位", prompt)
        self.assertIn("栏目：内容栏目", prompt)
        self.assertIn("规则：合规规则", prompt)
        self.assertIn("选题：咖啡机选择", prompt)

    def test_extract_json_object_accepts_markdown_wrapped_json(self):
        payload = """这里是结果：
```json
{
  "recommended_title": "第一台咖啡机别乱买",
  "hashtags": ["咖啡机"]
}
```
"""

        result = extract_json_object(payload)

        self.assertEqual(result["recommended_title"], "第一台咖啡机别乱买")
        self.assertEqual(result["hashtags"], ["咖啡机"])


class TopicTests(unittest.TestCase):
    def test_load_topics_returns_only_draft_rows_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "topics.csv"
            with path.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(
                    file,
                    fieldnames=["id", "topic", "category", "audience", "angle", "status"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "id": "001",
                        "topic": "咖啡机选择",
                        "category": "家居生活",
                        "audience": "租房女生",
                        "angle": "避坑",
                        "status": "draft",
                    }
                )
                writer.writerow(
                    {
                        "id": "002",
                        "topic": "通勤包清单",
                        "category": "职场穿搭",
                        "audience": "上班族女生",
                        "angle": "清单",
                        "status": "reviewed",
                    }
                )

            topics = load_topics(path)

        self.assertEqual([topic.id for topic in topics], ["001"])


class PackageTests(unittest.TestCase):
    def test_write_publish_package_creates_human_review_markdown_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            package = PublishPackage(
                topic_id="001",
                topic="新手如何选择第一台咖啡机",
                category="家居生活",
                audience="租房女生",
                angle="避坑",
                titles=["第一台咖啡机别乱买", "买咖啡机前先看这5点"],
                recommended_title="第一台咖啡机别乱买",
                cover_texts=["第一台咖啡机\n别急着买贵的"],
                body="之前我也以为预算越高越好。\n后来发现使用频率更重要。",
                hashtags=["咖啡机", "租房生活", "新手咖啡"],
                image_suggestions=["封面：咖啡机+大字标题", "图2：类型对比"],
                image_prompts=["竖版封面，咖啡机和大字标题", "咖啡机类型对比信息图"],
                image_paths=[],
                publish_time_suggestion="工作日 20:00-22:00",
                compliance_check={
                    "risk_level": "low",
                    "risks": [],
                    "rewrite_suggestions": [],
                },
                raw={"recommended_title": "第一台咖啡机别乱买"},
            )

            markdown_path = write_publish_package(package, output_dir)
            json_path = markdown_path.with_suffix(".json")

            markdown = markdown_path.read_text(encoding="utf-8")
            data = json.loads(json_path.read_text(encoding="utf-8"))

        self.assertEqual(markdown_path.name, "001_新手如何选择第一台咖啡机.md")
        self.assertIn("## 推荐标题\n第一台咖啡机别乱买", markdown)
        self.assertIn("## 人工审核区", markdown)
        self.assertIn("- 审核状态：draft", markdown)
        self.assertEqual(data["recommended_title"], "第一台咖啡机别乱买")
        self.assertEqual(data["publish_status"], "draft")
        self.assertEqual(data["image_prompts"], ["竖版封面，咖啡机和大字标题", "咖啡机类型对比信息图"])

    def test_extract_package_fields_returns_copy_ready_content(self):
        markdown = """# 发布包：咖啡机选择

## 推荐标题
第一台咖啡机别乱买

## 正文
之前我也以为预算越高越好。

## 话题
#咖啡机 #租房生活

## 人工审核区
- 审核状态：reviewed
"""

        fields = extract_package_fields(markdown)

        self.assertEqual(fields["title"], "第一台咖啡机别乱买")
        self.assertEqual(fields["body"], "之前我也以为预算越高越好。")
        self.assertEqual(fields["hashtags"], "#咖啡机 #租房生活")


class ImageAutomationTests(unittest.TestCase):
    def test_write_gemini_prompts_uses_existing_script_format(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "prompts.json"
            output_path = write_gemini_prompts(
                ["封面图提示词", "内容图提示词"],
                path,
            )
            data = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(
            data,
            [
                {"index": 1, "type": "封面图", "prompt": "封面图提示词"},
                {"index": 2, "type": "内容图", "prompt": "内容图提示词"},
            ],
        )

    def test_build_gemini_command_uses_absolute_prompt_path(self):
        command = build_gemini_command(
            Path("/tmp/prompts.json"),
            script_path=Path("/opt/gemini_automation.py"),
        )

        self.assertEqual(
            command,
            ["python3", "/opt/gemini_automation.py", "--prompts", "/tmp/prompts.json"],
        )


class PublishAutomationTests(unittest.TestCase):
    def test_prepare_publish_files_writes_title_and_content_with_hashtags(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = {
                "recommended_title": "第一台咖啡机别乱买",
                "body": "正文第一段\n\n正文第二段",
                "hashtags": ["咖啡机", "租房生活"],
            }

            title_file, content_file = prepare_publish_files(package, Path(tmp))

            title = title_file.read_text(encoding="utf-8")
            content = content_file.read_text(encoding="utf-8")

        self.assertEqual(title, "第一台咖啡机别乱买")
        self.assertEqual(content, "正文第一段\n\n正文第二段\n\n#咖啡机 #租房生活")

    def test_build_publish_command_uses_xhs_cli_publish(self):
        command = build_publish_command(
            Path("/tmp/title.txt"),
            Path("/tmp/content.txt"),
            [Path("/tmp/image_1.jpg"), Path("/tmp/image_2.jpg")],
            cli_path=Path("/opt/xhs/cli.py"),
        )

        self.assertEqual(
            command,
            [
                "python3",
                "/opt/xhs/cli.py",
                "publish",
                "--title-file",
                "/tmp/title.txt",
                "--content-file",
                "/tmp/content.txt",
                "--images",
                "/tmp/image_1.jpg",
                "/tmp/image_2.jpg",
            ],
        )

    def test_update_publish_status_records_success_without_losing_package_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_path = Path(tmp) / "package.json"
            package_path.write_text(
                json.dumps(
                    {
                        "recommended_title": "第一台咖啡机别乱买",
                        "publish_status": "draft",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            update_publish_status(
                package_path,
                status="published",
                note_url="https://www.xiaohongshu.com/explore/abc",
            )
            data = json.loads(package_path.read_text(encoding="utf-8"))

        self.assertEqual(data["recommended_title"], "第一台咖啡机别乱买")
        self.assertEqual(data["publish_status"], "published")
        self.assertEqual(data["note_url"], "https://www.xiaohongshu.com/explore/abc")


class AutoPublishFlowTests(unittest.TestCase):
    def test_auto_publish_package_stops_when_review_is_not_approved(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_path = Path(tmp) / "package.json"
            package_path.write_text(
                json.dumps(
                    {
                        "recommended_title": "第一台咖啡机别乱买",
                        "body": "正文",
                        "hashtags": ["咖啡机"],
                        "image_prompts": ["图片提示词"],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            calls: list[str] = []

            with self.assertRaises(ReviewRejected):
                auto_publish_package(
                    package_path,
                    approved=False,
                    image_generator=lambda prompts: calls.append("images") or [],
                    publisher=lambda path, images: calls.append("publish") or {},
                )

        self.assertEqual(calls, [])

    def test_auto_publish_package_generates_images_then_publishes_when_approved(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_path = Path(tmp) / "package.json"
            package_path.write_text(
                json.dumps(
                    {
                        "recommended_title": "第一台咖啡机别乱买",
                        "body": "正文",
                        "hashtags": ["咖啡机"],
                        "image_prompts": ["图片提示词"],
                        "publish_status": "draft",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            result = auto_publish_package(
                package_path,
                approved=True,
                image_generator=lambda prompts: [Path("/tmp/image_1.jpg")],
                publisher=lambda path, images: {"success": True, "images": [str(image) for image in images]},
            )
            data = json.loads(package_path.read_text(encoding="utf-8"))

        self.assertEqual(result["success"], True)
        self.assertEqual(data["image_paths"], ["/tmp/image_1.jpg"])


class MetricsTests(unittest.TestCase):
    def test_calculate_rates_handles_zero_views(self):
        rates = calculate_rates(
            {
                "views": "0",
                "likes": "10",
                "saves": "5",
                "comments": "2",
                "shares": "1",
                "follows": "1",
            }
        )

        self.assertEqual(rates["like_rate"], 0.0)
        self.assertEqual(rates["engagement_rate"], 0.0)

    def test_summarize_metrics_groups_rows_by_post_id(self):
        summary = summarize_metrics(
            [
                {
                    "post_id": "001",
                    "date": "2026-06-27",
                    "views": "100",
                    "likes": "10",
                    "saves": "5",
                    "comments": "2",
                    "shares": "1",
                    "follows": "1",
                },
                {
                    "post_id": "001",
                    "date": "2026-06-29",
                    "views": "200",
                    "likes": "30",
                    "saves": "20",
                    "comments": "6",
                    "shares": "4",
                    "follows": "3",
                },
            ]
        )

        self.assertEqual(summary["001"]["latest"]["views"], 200)
        self.assertEqual(summary["001"]["totals"]["views"], 300)
        self.assertAlmostEqual(summary["001"]["latest_rates"]["engagement_rate"], 0.3)


if __name__ == "__main__":
    unittest.main()
