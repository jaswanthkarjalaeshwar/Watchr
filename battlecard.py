import json
import sqlite3
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

load_dotenv()

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "watcher.db"
BATTLECARDS_DIR = BASE_DIR / "battlecards"
BATTLECARDS_DIR.mkdir(exist_ok=True)

_client = anthropic.Anthropic()

# ── colour palette ────────────────────────────────────────────────────────────
INK        = colors.HexColor("#0d0d1a")
WHITE      = colors.HexColor("#ffffff")
ACCENT     = colors.HexColor("#8b78f6")
ACCENT_DIM = colors.HexColor("#1e1a3a")
MUTED      = colors.HexColor("#6b6b8a")
GREEN      = colors.HexColor("#34d399")
RED        = colors.HexColor("#f87171")
YELLOW     = colors.HexColor("#fbbf24")
SURFACE    = colors.HexColor("#12121f")
BORDER     = colors.HexColor("#1e1e30")


def _get_snapshots(competitor_name: str) -> list[dict]:
    """Return the latest snapshot per page_type for this competitor."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT page_type, url, content, scraped_at
            FROM snapshots
            WHERE competitor = ?
            ORDER BY scraped_at DESC
            """,
            (competitor_name,),
        )
        rows = cursor.fetchall()

    # keep only the freshest snapshot per page_type
    seen: set[str] = set()
    snapshots: list[dict] = []
    for row in rows:
        if row["page_type"] not in seen:
            seen.add(row["page_type"])
            snapshots.append(dict(row))
    return snapshots


def _synthesize(competitor_name: str, snapshots: list[dict]) -> dict:
    """Send all snapshot content to Claude and get a battle card JSON back."""
    if not snapshots:
        raise ValueError(f"No snapshots found for '{competitor_name}' in the database.")

    pages_text = "\n\n".join(
        f"=== {s['page_type'].upper()} PAGE (scraped {s['scraped_at']}) ===\n{s['content'][:4000]}"
        for s in snapshots
    )

    prompt = f"""You are a competitive intelligence analyst. Based on the following scraped pages
from {competitor_name}'s website, produce a comprehensive sales battle card.

{pages_text}

Respond with a single JSON object containing exactly these keys:
- "positioning": string — how {competitor_name} positions themselves in 2-3 sentences
- "pricing_summary": string — current pricing tiers, price points, and notable limits
- "strengths": list of 3-4 strings, each a distinct competitive strength
- "weaknesses": list of 3-4 strings, each a genuine weakness or gap
- "recent_moves": list of up to 3 strings describing the most significant recent changes detected
- "counter_strategy": string — 2-3 sentences on how a competitor should position against {competitor_name}
- "watch_out_for": string — one key thing to monitor closely about {competitor_name}
- "hiring_signal": string — one sentence on what their current hiring pattern suggests (omit if no careers data)

Return raw JSON only. No markdown fences, no explanation."""

    response = _client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    return json.loads(text)


# ── PDF helpers ───────────────────────────────────────────────────────────────

def _style(name, **kwargs) -> ParagraphStyle:
    defaults = dict(fontName="Helvetica", fontSize=10, textColor=WHITE, leading=15)
    defaults.update(kwargs)
    return ParagraphStyle(name, **defaults)


S_TITLE      = _style("title",      fontName="Helvetica-Bold", fontSize=26, textColor=WHITE, leading=32, spaceAfter=2)
S_SUBTITLE   = _style("subtitle",   fontSize=11, textColor=MUTED, leading=14, spaceAfter=14)
S_SECTION    = _style("section",    fontName="Helvetica-Bold", fontSize=9, textColor=ACCENT,
                       leading=12, spaceBefore=14, spaceAfter=6, textTransform="uppercase")
S_BODY       = _style("body",       fontSize=10, textColor=WHITE, leading=15, spaceAfter=4)
S_BULLET     = _style("bullet",     fontSize=10, textColor=WHITE, leading=15, leftIndent=12,
                       bulletIndent=0, spaceAfter=3)
S_SIGNAL     = _style("signal",     fontSize=10, textColor=YELLOW, leading=14,
                       fontName="Helvetica-Oblique", spaceAfter=4)
S_WATCH      = _style("watch",      fontSize=10, textColor=RED, leading=14, spaceAfter=4)
S_COUNTER    = _style("counter",    fontSize=10, textColor=GREEN, leading=15, spaceAfter=4)
S_LABEL      = _style("label",      fontName="Helvetica-Bold", fontSize=9, textColor=MUTED,
                       leading=11, spaceAfter=2)


def _hr(color=BORDER):
    return HRFlowable(width="100%", thickness=1, color=color, spaceAfter=6, spaceBefore=4)


def _section(title: str) -> list:
    return [Spacer(1, 2*mm), Paragraph(title, S_SECTION), _hr()]


def _bullets(items: list[str], style=S_BULLET) -> list:
    return [Paragraph(f"• {item}", style) for item in items]


def _strength_weakness_table(strengths: list[str], weaknesses: list[str]) -> Table:
    """Two-column table: strengths (green) on left, weaknesses (red) on right."""
    def cell_paras(items, text_color):
        style = _style(f"sw_{id(items)}", fontSize=9, textColor=text_color, leading=13)
        return [Paragraph(f"+ {t}" if text_color == GREEN else f"− {t}", style)
                for t in items]

    rows = max(len(strengths), len(weaknesses))
    s_paras = cell_paras(strengths, GREEN)
    w_paras = cell_paras(weaknesses, RED)

    header = [
        Paragraph("STRENGTHS", _style("sh", fontName="Helvetica-Bold", fontSize=8,
                                      textColor=GREEN, leading=10)),
        Paragraph("WEAKNESSES", _style("wh", fontName="Helvetica-Bold", fontSize=8,
                                       textColor=RED, leading=10)),
    ]
    data = [header] + [[s_paras[i] if i < len(s_paras) else "",
                         w_paras[i] if i < len(w_paras) else ""]
                        for i in range(rows)]

    tbl = Table(data, colWidths=["50%", "50%"], hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#0d2b1e")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#2b0d0d")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#0a1a14")),
        ("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#1a0a0a")),
        ("LINEAFTER",  (0, 0), (0, -1), 1, BORDER),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    return tbl


def _build_pdf(path: Path, competitor_name: str, card: dict) -> None:
    W, H = A4
    margin = 18 * mm

    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin,  bottomMargin=margin,
    )

    # ── header banner drawn via a 1-row table ─────────────────────────────
    banner_data = [[
        Paragraph(competitor_name, S_TITLE),
        Paragraph("Battle Card  ·  Competitive Intelligence", S_SUBTITLE),
    ]]
    banner = Table(banner_data, colWidths=[W - 2*margin], hAlign="LEFT")
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_DIM),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING",   (0, 0), (-1, -1), 16),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 16),
        ("ROUNDEDCORNERS", [6]),
    ]))

    story = [banner, Spacer(1, 5*mm)]

    # ── Positioning ───────────────────────────────────────────────────────
    story += _section("Positioning")
    story.append(Paragraph(card.get("positioning", ""), S_BODY))

    # ── Pricing ───────────────────────────────────────────────────────────
    story += _section("Pricing")
    story.append(Paragraph(card.get("pricing_summary", ""), S_BODY))

    # ── Strengths & Weaknesses ────────────────────────────────────────────
    story += _section("Strengths & Weaknesses")
    story.append(_strength_weakness_table(
        card.get("strengths", []),
        card.get("weaknesses", []),
    ))

    # ── Recent Moves ──────────────────────────────────────────────────────
    story += _section("Recent Moves")
    story += _bullets(card.get("recent_moves", []))

    # ── Hiring Signal (optional) ──────────────────────────────────────────
    if card.get("hiring_signal"):
        story += _section("Hiring Signal")
        story.append(Paragraph(f"↗  {card['hiring_signal']}", S_SIGNAL))

    # ── Counter Strategy ──────────────────────────────────────────────────
    story += _section("Counter Strategy")
    story.append(Paragraph(card.get("counter_strategy", ""), S_COUNTER))

    # ── Watch Out For ─────────────────────────────────────────────────────
    story += _section("Watch Out For")
    story.append(Paragraph(f"⚠  {card.get('watch_out_for', '')}", S_WATCH))

    # ── page background via onPage callback ───────────────────────────────
    def dark_background(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(INK)
        canvas.rect(0, 0, W, H, fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=dark_background, onLaterPages=dark_background)


# ── public API ────────────────────────────────────────────────────────────────

def generate_battle_card(competitor_name: str) -> Path:
    """
    Query watcher.db, synthesize a battle card with Claude, render to PDF.
    Returns the Path to the saved PDF.
    """
    snapshots = _get_snapshots(competitor_name)
    card = _synthesize(competitor_name, snapshots)

    safe_name = competitor_name.replace(" ", "_").replace("/", "-")
    pdf_path = BATTLECARDS_DIR / f"{safe_name}_battlecard.pdf"
    _build_pdf(pdf_path, competitor_name, card)

    print(f"[battlecard] Saved → {pdf_path}")
    return pdf_path


if __name__ == "__main__":
    import sys
    name = sys.argv[1] if len(sys.argv) > 1 else "Notion"
    generate_battle_card(name)
