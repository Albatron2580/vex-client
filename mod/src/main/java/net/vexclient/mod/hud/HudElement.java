package net.vexclient.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.vexclient.mod.module.Setting;

import java.util.ArrayList;
import java.util.List;

/**
 * One movable HUD element. Position is stored as a fraction of the screen (0..1) so layouts survive
 * resolution changes. Elements draw themselves at (0,0) and report their size; the HUD applies
 * position, scale, background and colour.
 */
public abstract class HudElement {
    public final String id;
    public final String name;
    public boolean enabled;
    public float x, y;      // top-left as a fraction of the screen
    public float scale = 1f;
    public int color = 0xFFFFFFFF;
    public boolean background = true;
    /** Shown on the Combat page instead of the HUD page. */
    public boolean combat;
    public final List<Setting<?>> settings = new ArrayList<>();
    // size of the last frame (unscaled), used by the editor
    public int lastW = 40, lastH = 10;

    protected HudElement(String id, String name, boolean enabled, float x, float y) {
        this.id = id; this.name = name; this.enabled = enabled; this.x = x; this.y = y;
    }

    protected <S extends Setting<?>> S add(S s) { settings.add(s); return s; }

    /** Lines to draw; return null/empty to draw nothing this frame. */
    protected abstract List<String> lines(Minecraft mc);

    /** Sample lines for the HUD editor when there is no data (e.g. no potion effects). */
    protected List<String> preview() { return List.of(name); }

    /** Draws the element's own content at (0,0); default draws text lines. Returns {w, h}. */
    public int[] draw(GuiGraphics g, Minecraft mc, boolean editing) {
        List<String> l = lines(mc);
        if ((l == null || l.isEmpty()) && editing) l = preview();
        if (l == null || l.isEmpty()) return null;
        int w = 0;
        for (String s : l) w = Math.max(w, mc.font.width(s));
        int h = l.size() * 10 - 1;
        if (background) g.fill(-3, -3, w + 3, h + 2, 0x8C120A24);
        for (int i = 0; i < l.size(); i++) g.drawString(mc.font, l.get(i), 0, i * 10, color, true);
        return new int[]{w + 6, h + 5};
    }
}
