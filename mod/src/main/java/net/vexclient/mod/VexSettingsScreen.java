package net.vexclient.mod;

import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.function.Consumer;
import java.util.function.Supplier;

/** The in-game Vex Client settings menu (Right Shift, the V button on the title screen, or the pause menu). */
public final class VexSettingsScreen extends Screen {
    private static final int PANEL_W = 340;
    private static final int ACCENT = 0xFF2F7DFF;
    private final Screen parent;
    private int top;

    public VexSettingsScreen(Screen parent) {
        super(Component.literal("Vex Client Settings"));
        this.parent = parent;
    }

    private Component onOff(String label, boolean on) {
        return Component.literal(label + ": ").append(on
                ? Component.literal("ON").withStyle(ChatFormatting.GREEN, ChatFormatting.BOLD)
                : Component.literal("OFF").withStyle(ChatFormatting.RED));
    }

    private void toggle(int col, int row, String label, Supplier<Boolean> get, Consumer<Boolean> set) {
        int x = this.width / 2 - PANEL_W / 2 + 14 + col * 160;
        int y = top + 36 + row * 24;
        Button[] holder = new Button[1];
        holder[0] = Button.builder(onOff(label, get.get()), b -> {
            set.accept(!get.get());
            VexConfig.save();
            b.setMessage(onOff(label, get.get()));
        }).bounds(x, y, 152, 20).build();
        this.addRenderableWidget(holder[0]);
    }

    @Override
    protected void init() {
        VexConfig c = VexConfig.get();
        top = Math.max(10, this.height / 2 - 120);

        toggle(0, 0, "FPS", () -> c.showFps, v -> c.showFps = v);
        toggle(1, 0, "Coordinates", () -> c.showCoords, v -> c.showCoords = v);
        toggle(0, 1, "Direction", () -> c.showDirection, v -> c.showDirection = v);
        toggle(1, 1, "HUD background", () -> c.hudBackground, v -> c.hudBackground = v);
        toggle(0, 3, "Zoom (hold C)", () -> c.zoom, v -> c.zoom = v);
        toggle(1, 3, "Smooth zoom", () -> c.smoothZoom, v -> c.smoothZoom = v);
        toggle(0, 5, "Always sprint", () -> c.alwaysSprint, v -> {
            c.alwaysSprint = v;
            if (!v && this.minecraft != null) this.minecraft.options.keySprint.setDown(false);
        });
        toggle(1, 5, "Vex menu buttons", () -> c.vexTitleButtons, v -> c.vexTitleButtons = v);

        int x = this.width / 2 - PANEL_W / 2 + 14;
        this.addRenderableWidget(Button.builder(zoomLabel(c), b -> {
            c.zoomLevel = c.zoomLevel >= 8 ? 2 : c.zoomLevel + 1;
            VexConfig.save();
            b.setMessage(zoomLabel(c));
        }).bounds(x, top + 36 + 4 * 24, 312, 20).build());

        this.addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose())
                .bounds(this.width / 2 - 100, top + 36 + 6 * 24 + 14, 200, 20).build());
    }

    private Component zoomLabel(VexConfig c) {
        return Component.literal("Zoom strength: ").append(Component.literal(c.zoomLevel + "x").withStyle(ChatFormatting.AQUA));
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        int x0 = this.width / 2 - PANEL_W / 2;
        int x1 = x0 + PANEL_W;
        int y1 = top + 36 + 6 * 24 + 46;
        g.fill(x0 - 1, top - 1, x1 + 1, y1 + 1, ACCENT);            // accent border
        g.fill(x0, top, x1, y1, 0xE60A1430);                         // panel
        g.fill(x0, top, x1, top + 26, 0xFF0F1E42);                   // header
        g.fill(x0, top + 26, x1, top + 27, ACCENT);
        g.fill(x0 + 14, top + 36 + 2 * 24 + 9, x1 - 14, top + 36 + 2 * 24 + 10, 0x552F7DFF); // section lines
        g.fill(x0 + 14, top + 36 + 4 * 24 + 22, x1 - 14, top + 36 + 4 * 24 + 23, 0x552F7DFF);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int cx = this.width / 2;
        g.drawCenteredString(this.font, Component.literal("VEX CLIENT").withStyle(ChatFormatting.BOLD), cx, top + 9, 0xFFFFFFFF);
        g.drawString(this.font, "HUD", cx - PANEL_W / 2 + 14, top + 30, 0xFF8FB8FF, false);
        g.drawString(this.font, "Zoom", cx - PANEL_W / 2 + 14, top + 36 + 2 * 24 + 14, 0xFF8FB8FF, false);
        g.drawString(this.font, "Movement & menus", cx - PANEL_W / 2 + 14, top + 36 + 5 * 24 - 10, 0xFF8FB8FF, false);
        g.drawCenteredString(this.font, Component.literal("Right Shift opens this menu in game").withStyle(ChatFormatting.GRAY), cx, top + 36 + 6 * 24 + 50, 0xFFAAAAAA);
    }

    @Override
    public void onClose() {
        VexConfig.save();
        if (this.minecraft != null) this.minecraft.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return true;
    }
}
