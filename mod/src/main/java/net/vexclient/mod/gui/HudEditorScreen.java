package net.vexclient.mod.gui;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;
import net.vexclient.mod.module.Setting;
import org.lwjgl.glfw.GLFW;

/** Drag HUD elements to move them; the buttons at the bottom change the selected one. Saved on close. */
public final class HudEditorScreen extends Screen {
    private final Screen parent;
    private HudElement selected, dragging;
    private double grabX, grabY;
    private boolean wasDown;
    private Button scaleDown, scaleUp, colorBtn, bgBtn, hideBtn;

    public HudEditorScreen(Screen parent) {
        super(Component.literal("Edit HUD"));
        this.parent = parent;
    }

    @Override public boolean isPauseScreen() { return false; }

    @Override
    protected void init() {
        int y = this.height - 28, cx = this.width / 2;
        scaleDown = addRenderableWidget(Button.builder(Component.literal("Smaller"), b -> scale(-0.1f)).bounds(cx - 212, y, 60, 20).build());
        scaleUp = addRenderableWidget(Button.builder(Component.literal("Bigger"), b -> scale(0.1f)).bounds(cx - 150, y, 60, 20).build());
        colorBtn = addRenderableWidget(Button.builder(Component.literal("Colour"), b -> { if (selected != null) { selected.color = nextColor(selected.color); Hud.save(); } refresh(); }).bounds(cx - 88, y, 80, 20).build());
        bgBtn = addRenderableWidget(Button.builder(Component.literal("Background"), b -> { if (selected != null) { selected.background = !selected.background; Hud.save(); } refresh(); }).bounds(cx - 6, y, 86, 20).build());
        hideBtn = addRenderableWidget(Button.builder(Component.literal("Hide"), b -> { if (selected != null) { selected.enabled = false; selected = null; Hud.save(); } refresh(); }).bounds(cx + 82, y, 50, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(cx + 140, y, 72, 20).build());
        refresh();
    }

    private static int nextColor(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return p[(i + 1) % p.length];
        return p[0];
    }

    private void scale(float d) {
        if (selected == null) return;
        selected.scale = Math.max(0.5f, Math.min(3f, Math.round((selected.scale + d) * 10) / 10f));
        Hud.save();
        refresh();
    }

    private void refresh() {
        boolean on = selected != null;
        for (Button b : new Button[]{scaleDown, scaleUp, colorBtn, bgBtn, hideBtn}) if (b != null) b.active = on;
        if (on) {
            colorBtn.setMessage(Component.literal("Colour: " + colorName(selected.color)));
            bgBtn.setMessage(Component.literal("Background: " + (selected.background ? "ON" : "OFF")));
        }
    }

    private static String colorName(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return Setting.Color.NAMES[i];
        return "Custom";
    }

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
        boolean overWidget = false;
        for (var c : children()) if (c.isMouseOver(mouseX, mouseY)) overWidget = true;

        HudElement hover = null;
        for (HudElement e : Hud.ELEMENTS) {
            if (!e.enabled) continue;
            int[] box = Hud.drawElement(g, this.minecraft, e, true);
            if (box == null) continue;
            boolean in = mouseX >= box[0] && mouseX <= box[0] + box[2] && mouseY >= box[1] && mouseY <= box[1] + box[3];
            if (in) hover = e;
            int col = e == selected ? Ui.ORANGE : in ? 0xFFFFFFFF : 0x88B46CFF;
            g.fill(box[0] - 1, box[1] - 1, box[0] + box[2] + 1, box[1], col);
            g.fill(box[0] - 1, box[1] + box[3], box[0] + box[2] + 1, box[1] + box[3] + 1, col);
            g.fill(box[0] - 1, box[1], box[0], box[1] + box[3], col);
            g.fill(box[0] + box[2], box[1], box[0] + box[2] + 1, box[1] + box[3], col);
            if (e == selected) g.drawString(this.font, e.name + "  " + Math.round(e.scale * 100) + "%", box[0], Math.max(2, box[1] - 11), Ui.ORANGE, true);
        }

        if (down && !wasDown && !overWidget) {
            selected = hover;
            dragging = hover;
            if (hover != null) {
                grabX = mouseX - hover.x * this.width;
                grabY = mouseY - hover.y * this.height;
            }
            refresh();
        }
        if (down && dragging != null) {
            double nx = mouseX - grabX, ny = mouseY - grabY;
            // snap to the grid when close
            if (Math.abs(nx % 20) < 3) nx -= nx % 20;
            if (Math.abs(ny % 20) < 3) ny -= ny % 20;
            dragging.x = (float) Math.max(0, Math.min(1, nx / this.width));
            dragging.y = (float) Math.max(0, Math.min(1, ny / this.height));
        }
        if (!down && wasDown && dragging != null) { dragging = null; Hud.save(); }
        wasDown = down;

        g.drawCenteredString(this.font, "Drag to move · click one to select it · layout " + Hud.activeSlot(), this.width / 2, 8, Ui.TEXT);
        int hidden = 0;
        for (HudElement e : Hud.ELEMENTS) if (!e.enabled) hidden++;
        if (hidden > 0) g.drawCenteredString(this.font, hidden + " hidden: turn them on in the Display tab", this.width / 2, 20, Ui.DIM);
    }

    @Override
    public void onClose() {
        Hud.save();
        this.minecraft.setScreen(parent);
    }
}
