package net.vexclient.mod.gui;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

/** Shared Vex look: dark purple panels with orange accents, drawn by hand (no vanilla buttons). */
public final class Ui {
    private Ui() {}
    public static final int SHADE = 0xB0080412;
    public static final int PANEL = 0xF2150C26;
    public static final int SIDE = 0xF20E0819;
    public static final int CARD = 0xFF1E1236;
    public static final int CARD_HOVER = 0xFF2A1A4B;
    public static final int EDGE = 0xFF3A2463;
    public static final int EDGE_SOFT = 0x553A2463;
    public static final int ORANGE = 0xFFFF8A1F;
    public static final int ORANGE_HI = 0xFFFFA64D;
    public static final int ORANGE_DARK = 0xFF9C4A06;
    public static final int PURPLE = 0xFFB46CFF;
    public static final int TEXT = 0xFFF3EEFF;
    public static final int DIM = 0xFF9D8DC0;
    public static final int GOOD = 0xFF5BFF7A;
    public static final int WARN = 0xFFFFC14F;
    public static final int BAD = 0xFFFF5B6E;
    public static final int OFF = 0xFF3B2D58;

    /** Rectangle with 2px rounded corners. */
    public static void round(GuiGraphics g, int x0, int y0, int x1, int y1, int c) {
        if (x1 - x0 < 4 || y1 - y0 < 4) { g.fill(x0, y0, x1, y1, c); return; }
        g.fill(x0 + 2, y0, x1 - 2, y1, c);
        g.fill(x0 + 1, y0 + 1, x0 + 2, y1 - 1, c);
        g.fill(x1 - 2, y0 + 1, x1 - 1, y1 - 1, c);
        g.fill(x0, y0 + 2, x0 + 1, y1 - 2, c);
        g.fill(x1 - 1, y0 + 2, x1, y1 - 2, c);
    }

    /** Rounded rectangle with a 1px border. */
    public static void card(GuiGraphics g, int x0, int y0, int x1, int y1, int fill, int border) {
        round(g, x0, y0, x1, y1, border);
        round(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill);
    }

    /** The big window: border, body, and an orange line along the top. */
    public static void panel(GuiGraphics g, int x0, int y0, int x1, int y1) {
        g.fill(x0 + 3, y0 + 3, x1 + 3, y1 + 3, 0x60000000); // drop shadow
        card(g, x0, y0, x1, y1, PANEL, EDGE);
        g.fill(x0 + 2, y0 + 1, x1 - 2, y0 + 2, ORANGE);
        g.fillGradient(x0 + 1, y0 + 2, x1 - 1, y0 + 30, 0x30FF8A1F, 0x00FF8A1F);
    }

    /** "VEX CLIENT": VEX in orange, CLIENT in white, with a hard pixel shadow. */
    public static void title(GuiGraphics g, Font font, int x, int y, float scale) {
        String a = "VEX ", b = "CLIENT";
        var pose = g.pose();
        pose.pushMatrix();
        pose.translate(x, y);
        pose.scale(scale, scale);
        g.drawString(font, a, 1, 1, 0xFF5A2A00, false);
        g.drawString(font, a, 0, 0, ORANGE, false);
        g.drawString(font, b, font.width(a) + 1, 1, 0xFF2A1450, false);
        g.drawString(font, b, font.width(a), 0, TEXT, false);
        pose.popMatrix();
    }

    public static int titleWidth(Font font, float scale) { return Math.round(font.width("VEX CLIENT") * scale); }

    /** On/off switch, 22x11. t = 0 (off) .. 1 (on), animated by the caller. */
    public static void toggle(GuiGraphics g, int x, int y, float t, boolean hover) {
        int track = mix(OFF, ORANGE, t);
        if (hover) track = mix(track, 0xFFFFFFFF, 0.12f);
        round(g, x, y, x + 22, y + 11, track);
        int kx = x + 1 + Math.round(t * 11);
        round(g, kx, y + 1, kx + 10, y + 10, 0xFFFFFFFF);
        g.fill(kx + 1, y + 9, kx + 9, y + 10, 0x40000000);
    }

    /** Slider track with the filled part in orange and a knob. f = 0..1. */
    public static void slider(GuiGraphics g, int x0, int y, int x1, float f, boolean hot) {
        g.fill(x0, y + 4, x1, y + 7, OFF);
        int k = x0 + Math.round(f * (x1 - x0));
        g.fill(x0, y + 4, k, y + 7, ORANGE);
        round(g, k - 3, y, k + 4, y + 11, hot ? ORANGE_HI : 0xFFFFFFFF);
    }

    /** Small pill button. style 0 = normal, 1 = orange, 2 = danger. */
    public static void chip(GuiGraphics g, Font font, int x0, int y0, int x1, int y1, String text, int style, boolean hover, boolean enabled) {
        int fill = switch (style) {
            case 1 -> hover ? ORANGE_HI : ORANGE;
            case 2 -> hover ? 0xFF5A1F2E : 0xFF3E1724;
            default -> hover ? 0xFF35225C : 0xFF281A46;
        };
        int border = style == 1 ? ORANGE_DARK : style == 2 ? 0xFF7A2A3C : EDGE;
        if (!enabled) { fill = 0xFF1B1430; border = EDGE_SOFT; }
        card(g, x0, y0, x1, y1, fill, border);
        int tc = !enabled ? DIM : style == 1 ? 0xFF1A0C00 : style == 2 ? 0xFFFFB3BF : TEXT;
        g.drawString(font, text, (x0 + x1) / 2 - font.width(text) / 2, (y0 + y1) / 2 - 4, tc, false);
    }

    public static int mix(int a, int b, float t) {
        t = Math.max(0, Math.min(1, t));
        int aa = a >>> 24, ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
        int ba = b >>> 24, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
        return Math.round(aa + (ba - aa) * t) << 24 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
    }
}
