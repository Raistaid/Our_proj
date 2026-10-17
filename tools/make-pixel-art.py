"""Generates the start-screen pixel art (own drawings, no external resources).

Run from the project root:  python3 tools/make-pixel-art.py
Writes game/assets/pixel/*.svg
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'game' / 'assets' / 'pixel'
INK = '#18212c'
COLORS = {
    'k': INK, 'w': '#fff9e9', 'v': '#b2a3ed', 'p': '#f9b6d1', 'g': '#e4ff69',
    'c': '#b5e75c', 'd': '#7caa3b', 'b': '#c9bdff',
}


def svg(width, height, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
            'shape-rendering="crispEdges">%s</svg>\n' % (width, height, width * 8, height * 8, body))


def runs(rows, colors=COLORS):
    """Pixel map -> <rect> per horizontal run of one color."""
    out = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            ch = row[x]
            end = x
            while end < len(row) and row[end] == ch:
                end += 1
            if ch != '.':
                out.append('<rect x="%d" y="%d" width="%d" height="1.08" fill="%s"/>' % (x, y, end - x, colors[ch]))
            x = end
    return ''.join(out)


def sprite(name, rows):
    size = len(rows)
    assert all(len(r) == size for r in rows), (name, [len(r) for r in rows])
    (OUT / (name + '.svg')).write_text(svg(size, size, runs(rows)))


SOCK = [
    '..kkkkkkk.......',
    '..kvvvvvk.......',
    '..kwwwwwk.......',
    '..kvvvvvk.......',
    '..kkkkkkk.......',
    '..kwwwwwk.......',
    '..kgkwkgk.......',
    '..kwwwwwk.......',
    '..kwkkkwk.......',
    '..kwwwwwkkk.....',
    '..kwwwwwwwwkk...',
    '..kwwwwwwwwwwk..',
    '..kpwwwwwwwwppk.',
    '..kppwwwwwwwpppk',
    '...kppwwwwwwppk.',
    '....kkkkkkkkkk..',
]
CLOUD = [
    '................',
    '.....kkkk.......',
    '..kkkwwwwk.kk...',
    '.kwwwwwwwwkwwk..',
    '.kwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwk',
    'kwwwkwwwwwkwwwwk',
    'kwwwwwwwwwwwwwwk',
    'kwwwwkkkkwwwwwwk',
    '.kwwwwwwwwwwwwk.',
    '..kkkkkkkkkkkk..',
    '......kpk.......',
    '......kpk.kkkk..',
    '.......k.kvvvvk.',
    '.........kvvvvk.',
    '.........kkkkkk.',
]
CUCUMBER = [
    '......kkkk......',
    '.....kcccck.....',
    'kk...kcccck...kk',
    'kwk..kcccck..kwk',
    'kwwk.kkkkkk.kwwk',
    '.kwwkkgkkgkkwwk.',
    '..kwwkcccckwwk..',
    '...kkkcccckkk...',
    '.....kckkck.....',
    '.....kcccck.....',
    '.....kcccdk.....',
    '.....kdccck.....',
    '.....kcccck.....',
    '.....kcdcck.....',
    '......kkkk......',
    '................',
]

# 5x7 block letters, drawn for this project.
GLYPHS = {
    'Л': ['.####', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '##..#'],
    'И': ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
    'Ч': ['#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'],
    'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'З': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'Д': ['..##.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
    'Р': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'М': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
    '—': ['....', '....', '....', '####', '....', '....', '....'],
    '.': ['..', '..', '..', '..', '..', '..', '##'],
    ' ': ['..', '..', '..', '..', '..', '..', '..'],
}


def title(name, text, highlight):
    cells = []
    x = 1
    for ch in text:
        glyph = GLYPHS[ch]
        for gy, row in enumerate(glyph):
            for gx, on in enumerate(row):
                if on == '#':
                    cells.append((x + gx, 1 + gy))
        x += len(glyph[0]) + 1
    width, height = x + 1, 10
    body = []
    if highlight:
        # Lime marker block behind the line, slightly stepped like a pixel brush.
        body.append('<rect x="0" y="2" width="%d" height="8" fill="%s"/>' % (width, COLORS['g']))
        body.append('<rect x="1" y="1" width="%d" height="1.08" fill="%s"/>' % (width - 3, COLORS['g']))
    for cx, cy in cells:  # violet block shadow first
        body.append('<rect x="%d" y="%d" width="1" height="1.08" fill="#7663af"/>' % (cx + 1, cy + 1))
    for cx, cy in cells:
        body.append('<rect x="%d" y="%d" width="1" height="1.08" fill="%s"/>' % (cx, cy, INK))
    (OUT / (name + '.svg')).write_text(svg(width, height, ''.join(body)))


def cover():
    W, H = 60, 80
    grid = [['#e9e6ff'] * W for _ in range(H)]

    def fill(x0, y0, x1, y1, color):
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in range(max(0, x0), min(W, x1 + 1)):
                grid[y][x] = color

    def box(x0, y0, x1, y1, color, border=INK, cut=True):
        fill(x0, y0, x1, y1, border)
        fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, color)
        if cut:  # pixel-rounded corners
            for cx, cy in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
                grid[cy][cx] = None

    for y in range(2, 56, 6):
        for x in range(3, W, 6):
            grid[y][x] = '#d6d0f5'
    fill(0, 56, W - 1, H - 1, '#bad5e8')
    for y in (64, 72):
        fill(0, y, W - 1, y, '#9fbad0')
    for x in (15, 30, 45):
        fill(x, 56, x, H - 1, '#9fbad0')
    fill(0, 56, W - 1, 56, '#8aa6bd')
    # window
    box(40, 6, 55, 21, '#fff9e9', cut=False)
    fill(47, 7, 48, 20, INK)
    fill(41, 13, 54, 14, INK)
    fill(50, 8, 52, 10, '#ffe17a')
    # backpack: shadow, handle, straps, body, pocket
    box(18, 28, 45, 59, INK, cut=True)
    box(24, 21, 35, 28, '#e4ff69')
    fill(26, 23, 33, 28, '#e9e6ff')
    fill(13, 34, 15, 54, INK)
    fill(44, 34, 46, 54, INK)
    box(16, 26, 43, 57, '#b2a3ed')
    fill(19, 29, 40, 29, '#eeeaff')
    box(20, 42, 39, 53, '#e4ff69')
    fill(22, 45, 37, 45, INK)
    fill(36, 44, 37, 47, '#f9b6d1')
    grid[34][27] = grid[35][26] = grid[35][28] = grid[36][27] = '#fff9e9'
    grid[35][27] = '#fff9e9'
    fill(34, 34, 36, 36, '#f9b6d1')
    # little triangle toy
    for i in range(4):
        fill(8 - i, 48 + i, 8 + i, 48 + i, INK)
    fill(8, 49, 8, 50, '#fff9e9')
    # caption strip
    fill(4, 73, 55, 77, '#fff9e9')
    for x in range(7, 40, 4):
        fill(x, 75, x + 2, 75, INK)

    rects = []
    for y, row in enumerate(grid):
        x = 0
        while x < W:
            color = row[x]
            end = x
            while end < W and row[end] == color:
                end += 1
            if color:
                rects.append('<rect x="%d" y="%d" width="%d" height="1.08" fill="%s"/>' % (x, y, end - x, color))
            x = end
    (OUT / 'cover.svg').write_text(svg(W, H, ''.join(rects)))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    sprite('sock', SOCK)
    sprite('cloud', CLOUD)
    sprite('cucumber', CUCUMBER)
    title('title-1', 'ЛИЧНОЕ —', False)
    title('title-2', 'ЗА КАДРОМ.', True)
    cover()
    for f in sorted(OUT.iterdir()):
        print(f.name, f.stat().st_size)
