from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from xhs_workflow.claude_client import ClaudeClient
from xhs_workflow.packages import package_from_result, write_publish_package
from xhs_workflow.prompts import read_text, render_prompt
from xhs_workflow.topics import Topic, load_topics


SYSTEM_PROMPT = "你是一个小红书内容策略专家和合规审稿人。请严格按用户要求输出 JSON，不要输出多余解释。"


def build_generation_prompt(root: Path, topic: Mapping[str, Any] | Topic) -> str:
    """Build the note-generation prompt from local docs and one topic row."""
    template = read_text(root / "prompts" / "generate_note.md")
    values = {
        "brand_guide": read_text(root / "docs" / "brand_guide.md"),
        "content_pillars": read_text(root / "docs" / "content_pillars.md"),
        "compliance_rules": read_text(root / "docs" / "compliance_rules.md"),
        "topic": _get(topic, "topic"),
        "category": _get(topic, "category"),
        "audience": _get(topic, "audience"),
        "angle": _get(topic, "angle"),
    }
    return render_prompt(template, values)


def generate_publish_packages(root: Path, status: str = "draft") -> list[Path]:
    """Generate publish packages for topics in the requested status."""
    topics = load_topics(root / "data" / "topics.csv", status=status)
    client = ClaudeClient(root)
    output_paths: list[Path] = []

    for topic in topics:
        prompt = build_generation_prompt(root, topic)
        result = client.complete_json(prompt, SYSTEM_PROMPT)
        package = package_from_result(topic, result)
        output_paths.append(write_publish_package(package, root / "output" / "publish_packages"))

    return output_paths


def _get(topic: Mapping[str, Any] | Topic, key: str) -> Any:
    if isinstance(topic, Mapping):
        return topic.get(key, "")
    return getattr(topic, key)
