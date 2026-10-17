package net.vexclient.mod.gui;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;
import net.vexclient.mod.module.Setting;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;

/** Drag HUD elements to move them; the bar at the bottom changes the selected one. Saved as you go. */
public final class HudEditorScreen extends Screen {
    private final Screen parent;
    private HudElement selected, dragging;
    private double grabX, grabY;
    private boolean wasDown = true;

    public HudEditorScreen(Screen parent) {
        super(Component.literal("Edit HUD"));
        this.parent = parent;
    }

    @Override public boolean isPauseScreen() { return false; }

    private static int nextColor(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return p[(i + 1) % p.length];
        return p[0];
    }

    private void click() { this.minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F)); }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float pt) {
        // keep the game visible: only a light tint and a grid to line things up
        g.fill(0, 0, this.width, this.height, 0x44000000);
        for (int x = 0; x < this.width; x += 20) g.fill(x, 0, x + 1, this.height, 0x14FFFFFF);
        for (int y = 0; y < this.height; y += 20) g.fill(0, y, this.width, y + 1, 0x14FFFFFF);
        g.fill(this.width / 2, 0, this.width / 2 + 1, this.height, 0x30FF8A1F);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float pt) {
        super.render(g, mouseX, mouseY, pt);
        long win = GLFW.glfwGetCurrentContext();
        boolean down = win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean pressed = down && !wasDown;

        // elements
        HudElement hover = null;
        List<int[]> placed = new ArrayList<>();
        for (HudElement e : Hud.ELEMENTS) {
            if (!e.enabled) continue;
            int[] box = Hud.drawElement(g, this.minecraft, e, true, e == dragging ? null : placed);
            if (box == null) continue;
            placed.add(box);
            boolean in = mouseX >= box[0] && mouseX <= box[0] + box[2] && mouseY >= box[1] && mouseY <= box[1] + box[3];
            if (in) hover = e;
            int col = e == selected ? Ui.ORANGE : in ? 0xFFFFFFFF : 0x88B46CFF;
            g.fill(box[0] - 1, box[1] - 1, box[0] + box[2] + 1, box[1], col);
            g.fill(box[0] - 1, box[1] + box[3], box[0] + box[2] + 1, box[1] + box[3] + 1, col);
            g.fill(box[0] - 1, box[1], box[0], box[1] + box[3], col);
            g.fill(box[0] + box[2], box[1], box[0] + box[2] + 1, box[1] + box[3], col);
        }

        // hint pill at the top
        int hidden = 0;
        for (HudElement e : Hud.ELEMENTS) if (!e.enabled) hidden++;
        String hint = selected == null ? "Drag to move · click one to change it" : selected.name + " · " + Math.round(selected.scale * 100) + "%";
        int hw = this.font.width(hint) + 16;
        Ui.card(g, this.width / 2 - hw / 2, 6, this.width / 2 + hw / 2, 22, Ui.PANEL, Ui.EDGE);
        g.drawString(this.font, hint, this.width / 2 - this.font.width(hint) / 2, 10, selected == null ? Ui.TEXT : Ui.ORANGE, false);
        if (hidden > 0) {
            String h2 = hidden + " hidden · turn them on in the Display tab";
            g.drawString(this.font, h2, this.width / 2 - this.font.width(h2) / 2, 26, Ui.DIM, true);
        }

        // bottom bar
        String[] labels = {"Smaller", "Bigger", selected == null ? "Colour" : "Colour: " + colorName(selected.color), "Box: " + (selected != null && selected.background ? "on" : "off"), "Hide", "Done"};
        int[] widths = new int[labels.length];
        int total = 0;
        for (int i = 0; i < labels.length; i++) { widths[i] = this.font.width(labels[i]) + 16; total += widths[i] + 4; }
        int bx = this.width / 2 - total / 2, by = this.height - 26;
        Ui.card(g, bx - 6, by - 5, bx + total + 2, by + 19, Ui.PANEL, Ui.EDGE);
        int clicked = -1;
        boolean overBar = mouseX >= bx - 6 && mouseX < bx + total + 2 && mouseY >= by - 5 && mouseY < by + 19;
        for (int i = 0; i < labels.length; i++) {
            boolean enabled = i == labels.length - 1 || selected != null;
            boolean hv = enabled && mouseX >= bx && mouseX < bx + widths[i] && mouseY >= by && mouseY < by + 14;
            Ui.chip(g, this.font, bx, by, bx + widths[i], by + 14, labels[i], i == labels.length - 1 ? 1 : 0, hv, enabled);
            if (pressed && hv) clicked = i;
            bx += widths[i] + 4;
        }

        if (clicked >= 0) {
            click();
            switch (clicked) {
                case 0 -> selected.scale = Math.max(0.5f, Math.round((selected.scale - 0.1f) * 10) / 10f);
                case 1 -> selected.scale = Math.min(3f, Math.round((selected.scale + 0.1f) * 10) / 10f);
                case 2 -> selected.color = nextColor(selected.color);
                case 3 -> selected.background = !selected.background;
                case 4 -> { selected.enabled = false; selected = null; }
                default -> { onClose(); wasDown = down; return; }
            }
            Hud.save();
        } else if (pressed && !overBar) {
            selected = hover;
            dragging = hover;
            if (hover != null) {
                grabX = mouseX - hover.x * this.width;
                grabY = mouseY - hover.y * this.height;
            }
        }
        if (down && dragging != null) {
            double nx = mouseX - grabX, ny = mouseY - grabY;
            if (Math.abs(nx % 20) < 3) nx -= nx % 20; // snap to the grid when close
            if (Math.abs(ny % 20) < 3) ny -= ny % 20;
            dragging.x = (float) Math.max(0, Math.min(1, nx / this.width));
            dragging.y = (float) Math.max(0, Math.min(1, ny / this.height));
        }
        if (!down && wasDown && dragging != null) { dragging = null; Hud.save(); }
        wasDown = down;
    }

    private static String colorName(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return Setting.Color.NAMES[i];
        return "Custom";
    }

    @Override
    public void onClose() {
        Hud.save();
        this.minecraft.setScreen(parent);
    }
}
