"""Generates the game's pixel art: three stickers and three scene backgrounds.

All drawings are our own. Run from the project root:  python3 tools/make-pixel-art.py
Writes game/assets/stickers/*.svg (128 x 128) and game/assets/scenes/*.svg (360 x 480 board).

Scenes are drawn on a 60 x 80 grid (one cell = 6 board units). The main object of every
scene sits inside its keepZones "hero" rect from game/data/content.json, and the four
corners plus the bottom strip stay calm: notes and the caption are drawn there by renderer.js.
Scene backgrounds contain no codes, addresses or captions.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'game' / 'assets'
INK = '#0f1a24'
COLORS = {
    'k': INK, 'w': '#ffffff', 'e': '#e3ebf0', 's': '#21a038', 'm': '#42e3b4',
    'b': '#0087cd', 'y': '#f2e913', 'p': '#ffb3c7', 'c': '#7ed957', 'd': '#21a038',
}


def svg(cols, rows, body, width, height):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
            'shape-rendering="crispEdges">%s</svg>\n' % (cols, rows, width, height, body))


def row_rects(grid):
    """One <rect> per horizontal run of a colour. Rows overlap slightly downward
    (the next row paints over it), which hides hairline seams when the image is scaled."""
    out = []
    for y, row in enumerate(grid):
        x = 0
        while x < len(row):
            color = row[x]
            end = x
            while end < len(row) and row[end] == color:
                end += 1
            if color:
                out.append('<rect x="%d" y="%d" width="%d" height="1.08" fill="%s"/>' % (x, y, end - x, color))
            x = end
    return ''.join(out)


def sprite(name, rows):
    size = len(rows)
    assert all(len(r) == size for r in rows), (name, [len(r) for r in rows])
    grid = [[COLORS[ch] if ch != '.' else None for ch in row] for row in rows]
    (ROOT / 'stickers' / (name + '.svg')).write_text(svg(size, size, row_rects(grid), 128, 128))


SOCK = [
    '..kkkkkkk.......',
    '..ksssssk.......',
    '..kwwwwwk.......',
    '..ksssssk.......',
    '..kkkkkkk.......',
    '..kwwwwwk.......',
    '..kmkwkmk.......',
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
    'kweewwwwwwwweewk',
    'kwwwwkkkkwwwwwwk',
    '.kwwwwwwwwwwwwk.',
    '..kkkkkkkkkkkk..',
    '......kyk.......',
    '......kyk.kkkk..',
    '.......k.kbbbbk.',
    '.........kbybbk.',
    '.........kkkkkk.',
]
CUCUMBER = [
    '......kkkk......',
    '.....kcccck.....',
    'kk...kcccck...kk',
    'kwk..kcdcck..kwk',
    'kwwk.kkkkkk.kwwk',
    '.kwwkkmkkmkkwwk.',
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


class Scene:
    W, H = 60, 80

    def __init__(self, base):
        self.grid = [[base] * self.W for _ in range(self.H)]
        self.extra = []

    def fill(self, x0, y0, x1, y1, color):
        for y in range(max(0, y0), min(self.H, y1 + 1)):
            for x in range(max(0, x0), min(self.W, x1 + 1)):
                self.grid[y][x] = color

    def px(self, x, y, color):
        if 0 <= x < self.W and 0 <= y < self.H:
            self.grid[y][x] = color

    def box(self, x0, y0, x1, y1, color, border=INK, notch=True):
        """Filled box with a 1-cell border; notched corners give the pixel look."""
        self.fill(x0, y0, x1, y1, border)
        self.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, color)
        if notch:
            for cx, cy in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
                self.grid[cy][cx] = self.base_at(cx, cy)

    def base_at(self, x, y):
        return self.base

    def dots(self, y0, y1, color, step=6):
        for y in range(y0 + 2, y1, step):
            for x in range(3 if (y // step) % 2 else 6, self.W, step):
                self.px(x, y, color)

    def write(self, name):
        body = row_rects(self.grid) + ''.join(self.extra)
        (ROOT / 'scenes' / (name + '.svg')).write_text(svg(self.W, self.H, body, 720, 960))


def scene(base):
    s = Scene(base)
    s.base = base
    return s


def room():
    # hero rect [0.26, 0.3, 0.48, 0.38] -> cells x 16..44, y 24..54
    s = scene('#dff7ee')
    s.dots(0, 58, '#bfeedd')
    s.fill(0, 58, 59, 79, '#cfe8f7')
    s.fill(0, 58, 59, 58, '#9cc8e3')
    for y in (66, 74):
        s.fill(0, y, 59, y, '#b3d6ec')
    for x in (12, 30, 48):
        s.fill(x, 59, x, 79, '#b3d6ec')
    # window, top right (frame_01 has no note there)
    s.box(41, 5, 56, 20, '#ffffff', notch=False)
    s.fill(42, 6, 55, 19, '#bfe6ff')
    s.fill(48, 6, 49, 19, INK)
    s.fill(42, 12, 55, 13, INK)
    s.fill(51, 7, 53, 9, '#f2e913')
    # plant on the floor, right
    s.box(50, 51, 56, 58, '#0087cd')
    s.fill(52, 44, 54, 50, '#21a038')
    s.fill(50, 46, 51, 47, '#21a038')
    s.fill(55, 45, 56, 46, '#21a038')
    # backpack: shadow, handle, straps, body, pocket
    s.box(19, 29, 45, 56, INK)
    s.box(24, 21, 35, 28, '#f2e913')
    s.fill(26, 23, 33, 28, '#dff7ee')
    s.fill(14, 34, 16, 52, INK)
    s.fill(44, 34, 46, 52, INK)
    s.box(17, 27, 43, 54, '#42e3b4')
    s.fill(19, 29, 41, 29, '#a8f5de')
    s.box(21, 41, 39, 51, '#f2e913')
    s.fill(23, 44, 37, 44, INK)
    s.fill(36, 43, 37, 46, '#ffb3c7')
    for x, y in ((27, 33), (26, 34), (28, 34), (27, 35)):
        s.px(x, y, '#ffffff')
    s.fill(33, 33, 35, 35, '#0087cd')
    s.write('room')


def desk():
    # hero rect [0.22, 0.26, 0.56, 0.42] -> cells x 13..46, y 21..54
    s = scene('#fff1bf')
    for y in range(4, 80, 9):
        s.fill(0, y, 59, y, '#f5dd8f')
    # notebook with the robot drawing
    s.box(16, 23, 47, 55, INK, notch=False)
    s.box(14, 21, 45, 53, '#ffffff', notch=False)
    for y in range(25, 52, 3):
        s.fill(15, y, 44, y, '#d4ecfb')
    s.fill(18, 22, 18, 52, '#ffb3c7')
    # robot
    s.fill(29, 25, 30, 27, INK)
    s.box(28, 23, 31, 25, '#ff6b81', notch=False)
    s.box(22, 28, 37, 41, '#42e3b4')
    s.box(25, 31, 28, 34, '#ffffff', notch=False)
    s.box(31, 31, 34, 34, '#ffffff', notch=False)
    s.fill(26, 32, 27, 33, INK)
    s.fill(32, 32, 33, 33, INK)
    s.fill(26, 37, 33, 37, INK)
    s.fill(25, 36, 25, 36, INK)
    s.fill(34, 36, 34, 36, INK)
    s.fill(19, 32, 21, 33, INK)
    s.fill(38, 32, 40, 33, INK)
    s.fill(26, 42, 27, 47, INK)
    s.fill(32, 42, 33, 47, INK)
    s.fill(24, 48, 28, 49, INK)
    s.fill(31, 48, 35, 49, INK)
    # pencil, right of the notebook
    s.fill(50, 30, 52, 47, '#f2e913')
    s.fill(50, 30, 50, 47, INK)
    s.fill(52, 30, 52, 47, INK)
    s.fill(50, 29, 52, 29, '#ffb3c7')
    s.fill(51, 48, 51, 50, INK)
    # sparkle, left
    for x, y in ((6, 38), (5, 39), (7, 39), (6, 40), (6, 37), (6, 41), (4, 39), (8, 39)):
        s.px(x, y, '#0087cd')
    s.write('desk')


def poster():
    # hero rect [0.25, 0.26, 0.5, 0.4] -> cells x 15..45, y 21..53
    s = scene('#d9f0ff')
    s.dots(0, 80, '#b7e0fb')
    # side pennants
    for i in range(6):
        s.fill(0, 34 + i, 5 - i, 34 + i, '#42e3b4')
        s.fill(0, 45 - i, 5 - i, 45 - i, '#42e3b4')
        s.fill(54 + i, 34 + i, 59, 34 + i, '#f2e913')
        s.fill(54 + i, 45 - i, 59, 45 - i, '#f2e913')
    # the poster
    s.box(17, 22, 46, 55, INK, notch=False)
    s.box(15, 20, 44, 53, '#ffffff', notch=False)
    s.fill(17, 22, 42, 26, '#21a038')
    # teapot
    s.box(21, 33, 37, 48, '#ffb3c7')
    s.fill(24, 31, 34, 32, INK)
    s.box(27, 29, 30, 31, '#f2e913', notch=False)
    s.fill(16, 36, 20, 37, INK)
    s.fill(16, 35, 17, 36, INK)
    s.fill(38, 36, 41, 37, INK)
    s.fill(41, 38, 42, 43, INK)
    s.fill(38, 44, 41, 45, INK)
    s.fill(25, 38, 26, 39, INK)
    s.fill(32, 38, 33, 39, INK)
    s.fill(27, 42, 31, 42, INK)
    s.fill(23, 49, 25, 50, INK)
    s.fill(33, 49, 35, 50, INK)
    # The team name is ordinary text in a system font, not pixel letters.
    s.extra.append('<text x="29.5" y="25.2" text-anchor="middle" '
                   'font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" '
                   'font-size="2.6" font-weight="800" fill="#ffffff">ЧАЙНЫЙ КЛУБ</text>')
    s.write('poster')


if __name__ == '__main__':
    sprite('sock', SOCK)
    sprite('cloud', CLOUD)
    sprite('cucumber', CUCUMBER)
    room()
    desk()
    poster()
    for folder in ('stickers', 'scenes'):
        for f in sorted((ROOT / folder).iterdir()):
            print(folder + '/' + f.name, f.stat().st_size)
