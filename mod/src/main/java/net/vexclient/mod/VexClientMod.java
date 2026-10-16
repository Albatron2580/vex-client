package net.vexclient.mod;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Vex Client: in-game settings menu, HUD (FPS, coordinates), zoom and always-sprint. */
public final class VexClientMod implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("vexclient");

    public static KeyMapping openSettings;
    public static KeyMapping zoomKey;

    /** 1.0 = no zoom; eases towards the target each frame when smooth zoom is on. */
    public static float zoomFactor = 1.0f;

    @Override
    public void onInitializeClient() {
        VexConfig.load();

        openSettings = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, KeyMapping.Category.MISC));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.zoom", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_C, KeyMapping.Category.MISC));

        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            while (openSettings.consumeClick()) {
                if (mc.screen == null) mc.setScreen(new VexSettingsScreen(null));
            }
            VexConfig c = VexConfig.get();
            if (c.alwaysSprint && mc.player != null && mc.screen == null) {
                mc.options.keySprint.setDown(true);
            }
        });

        LOG.info("Vex Client mod loaded");
    }

    /**
     * Adds a full-width "Vex Client Settings" button to a menu: on the pause menu right under
     * "Back to Game", on the title screen above the Options row. Buttons below it move down one row.
     */
    public static void addSettingsButton(net.minecraft.client.gui.screens.Screen screen, java.util.List<? extends net.minecraft.client.gui.components.events.GuiEventListener> children,
                                         java.util.function.Consumer<net.minecraft.client.gui.components.Button> add, boolean title) {
        java.util.List<net.minecraft.client.gui.components.AbstractWidget> widgets = new java.util.ArrayList<>();
        for (var c : children) if (c instanceof net.minecraft.client.gui.components.AbstractWidget w) widgets.add(w);
        if (widgets.isEmpty()) return;
        int x = screen.width / 2 - 102, width = 204, y;
        if (title) {
            // the bottom row (Options / Quit and the two icon buttons)
            int rowY = Integer.MIN_VALUE;
            for (var w : widgets) if (w.getY() > rowY && w.getHeight() == 20) rowY = w.getY();
            y = rowY;
            x = screen.width / 2 - 100;
            width = 200;
        } else {
            // the first button of the pause menu ("Back to Game")
            net.minecraft.client.gui.components.AbstractWidget first = null;
            for (var w : widgets) if (first == null || w.getY() < first.getY()) first = w;
            x = first.getX();
            width = first.getWidth();
            y = first.getY() + first.getHeight() + 4;
        }
        final int insertY = y;
        for (var w : widgets) if (w.getY() >= insertY) w.setY(w.getY() + 24);
        var mc = Minecraft.getInstance();
        add.accept(net.minecraft.client.gui.components.Button.builder(
                net.minecraft.network.chat.Component.literal("Vex Client Settings"),
                b -> mc.setScreen(new VexSettingsScreen(screen))).bounds(x, insertY, width, 20).build());
    }

    /** Called every frame by the FOV mixin. */
    public static float zoomMultiplier() {
        VexConfig c = VexConfig.get();
        Minecraft mc = Minecraft.getInstance();
        boolean held = c.zoom && zoomKey != null && zoomKey.isDown() && mc.screen == null;
        float target = held ? 1.0f / c.zoomLevel : 1.0f;
        if (c.smoothZoom) zoomFactor += (target - zoomFactor) * 0.25f;
        else zoomFactor = target;
        if (Math.abs(zoomFactor - target) < 0.001f) zoomFactor = target;
        return zoomFactor;
    }
}
