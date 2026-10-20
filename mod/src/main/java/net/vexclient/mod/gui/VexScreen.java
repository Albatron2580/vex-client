package net.vexclient.mod.gui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.vexclient.mod.VexConfig;
import net.vexclient.mod.module.Modules;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Base of the VEX menus: GUI scale (GUI Settings), mouse polled each frame in scaled coordinates,
 * background dim, drifting petals, tooltips, animation helpers and one text field drawn inside the scaled view.
 * Everything is drawn in renderBackground (Minecraft draws that below the widgets).
 */
public abstract class VexScreen extends Screen {
    protected final Minecraft mc = Minecraft.getInstance();
    /** The screen to go back to when the whole VEX menu closes (the game, title screen or pause menu). */
    protected final Screen root;

    protected int W, H;           // size in scaled units
    protected float S = 1f;       // scale applied on top of Minecraft's GUI scale
    protected int mx, my;
    protected boolean down, rdown, pressed, rpressed, released;
    private boolean wasDown = true, wasR = true; // ignore the click that opened the screen
    private boolean wasRShift = true;
    protected float dt;
    private long lastFrame;
    protected GuiGraphics g;
    private final Map<String, Float> anim = new HashMap<>();
    protected EditBox input;
    protected boolean inputUsed;
    private String tip;

    protected VexScreen(String title, Screen root) {
        super(Component.literal(title));
        this.root = root;
    }

    @Override
    protected void init() {
        String keep = input != null ? input.getValue() : "";
        input = new EditBox(this.font, 0, 0, 100, 12, Component.literal("Search"));
        input.setBordered(false);
        input.setMaxLength(40);
        input.setTextColor(Ui.TEXT);
        input.setValue(keep);
        addWidget(input);
    }

    @Override public boolean isPauseScreen() { return true; }

    // ---------- helpers ----------
    protected boolean over(int x0, int y0, int x1, int y1) { return mx >= x0 && mx < x1 && my >= y0 && my < y1; }
    protected void sound() { mc.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F)); }

    protected float animate(String id, boolean on) {
        float t = anim.getOrDefault(id, on ? 1f : 0f);
        float target = on ? 1f : 0f;
        t += (target - t) * Math.min(1f, dt * 14f);
        if (Math.abs(target - t) < 0.01f) t = target;
        anim.put(id, t);
        return t;
    }

    protected void tip(String text) { if (VexConfig.get().tooltips && text != null) tip = text; }

    protected void focusInput(boolean on) {
        input.setFocused(on);
        setFocused(on ? input : null);
    }

    /** Draws the text field at (x, y, w) in scaled units with the VEX look. */
    protected void drawInput(int x, int y, int w, String hint) {
        inputUsed = true;
        input.setX(x); input.setY(y); input.setWidth(w);
        input.setHint(Component.literal(hint).withStyle(s -> s.withColor(Ui.DIM & 0xFFFFFF)));
        if (pressed) focusInput(over(x - 4, y - 4, x + w + 4, y + 12));
        input.render(g, mx, my, 0);
    }

    /** Closes every VEX screen. */
    protected void closeAll() { mc.setScreen(root); }

    // ---------- frame ----------
    private void pollMouse(double rawX, double rawY) {
        mx = (int) Math.floor(rawX / S); my = (int) Math.floor(rawY / S);
        long win = GLFW.glfwGetCurrentContext();
        boolean d = win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean r = win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        pressed = d && !wasDown; released = !d && wasDown; rpressed = r && !wasR;
        down = d; rdown = r; wasDown = d; wasR = r;
    }

    @Override
    public void renderBackground(GuiGraphics gr, int mouseX, int mouseY, float pt) {
        super.renderBackground(gr, mouseX, mouseY, pt);
        g = gr;
        long now = System.nanoTime();
        dt = lastFrame == 0 ? 0.016f : Math.min(0.1f, (now - lastFrame) / 1e9f);
        lastFrame = now;
        VexConfig c = VexConfig.get();
        int gs = Math.max(1, (int) Math.round(mc.getWindow().getGuiScale()));
        S = c.guiScale <= 0 ? 1f : Math.max(0.34f, c.guiScale / (float) gs);
        W = Math.round(this.width / S); H = Math.round(this.height / S);
        // never bigger than the window allows
        if (W < 300 || H < 200) { S = Math.min(this.width / 300f, this.height / 200f); S = Math.max(0.34f, Math.min(S, 1f)); W = Math.round(this.width / S); H = Math.round(this.height / S); }
        pollMouse(mouseX, mouseY);
        tip = null;
        inputUsed = false;

        if (c.backgroundDim) gr.fill(0, 0, this.width, this.height, 0x80060310);
        var pose = gr.pose();
        pose.pushMatrix();
        pose.scale(S, S);
        try {
            if (c.showParticles) petals();
            draw();
            if (tip != null) Ui.tooltip(gr, this.font, tip, mx, my, W, H);
        } finally {
            pose.popMatrix();
        }
        if (!inputUsed) { input.setX(-1000); if (input.isFocused()) focusInput(false); }
    }

    /** Draw the screen (scaled units: W x H, mouse in mx/my). */
    protected abstract void draw();

    @Override
    public void render(GuiGraphics gr, int mouseX, int mouseY, float pt) {
        super.render(gr, mouseX, mouseY, pt);
    }

    @Override
    public void tick() {
        super.tick();
        boolean rs = Modules.keyDown(GLFW.GLFW_KEY_RIGHT_SHIFT);
        if (rs && !wasRShift && rightShiftCloses()) closeAll();
        wasRShift = rs;
    }

    /** Right Shift closes the whole menu unless something is being typed. */
    protected boolean rightShiftCloses() { return !input.isFocused() || input.getValue().isEmpty(); }

    // ---------- petals ----------
    private static final List<float[]> PETALS = new ArrayList<>(); // x, y, vx, vy, rot, vrot, size, shade
    private static final Random RNG = new Random();

    private void petals() {
        int want = Math.max(12, W * H / 9000);
        while (PETALS.size() < want) PETALS.add(new float[]{RNG.nextFloat() * W, RNG.nextFloat() * H, 6 + RNG.nextFloat() * 10, 10 + RNG.nextFloat() * 14, RNG.nextFloat() * 6.28f, (RNG.nextFloat() - 0.5f) * 2, 2 + RNG.nextFloat() * 3, RNG.nextFloat()});
        while (PETALS.size() > want) PETALS.remove(PETALS.size() - 1);
        var pose = g.pose();
        for (float[] p : PETALS) {
            p[0] += (p[2] + (float) Math.sin(p[4]) * 6) * dt; p[1] += p[3] * dt; p[4] += p[5] * dt;
            if (p[1] > H + 8 || p[0] > W + 8) { p[0] = RNG.nextFloat() * W - 20; p[1] = -8; }
            int col = Ui.alpha(Ui.mix(Ui.ORANGE, Ui.ORANGE_HI, p[7]), 0.55f);
            pose.pushMatrix();
            pose.translate(p[0], p[1]);
            pose.rotate(p[4]);
            int s = Math.round(p[6]);
            g.fill(-s, -s / 2, s, s / 2 + 1, col);
            g.fill(-s / 2, -s, s / 2 + 1, s, col);
            pose.popMatrix();
        }
    }
}
