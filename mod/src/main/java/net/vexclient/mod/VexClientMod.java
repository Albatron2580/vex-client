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

/** Vex Client: the Right Shift menu, movable HUD, modules (zoom, sprint, fullbright, singleplayer cheats), shaders page. */
public final class VexClientMod implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("vexclient");

    public static KeyMapping openSettings;

    @Override
    public void onInitializeClient() {
        VexConfig.load();
        net.vexclient.mod.module.Modules.init();

        openSettings = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, KeyMapping.Category.MISC));

        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            while (openSettings.consumeClick()) {
                if (mc.screen == null) mc.setScreen(new net.vexclient.mod.gui.VexMenuScreen(null));
            }
            net.vexclient.mod.module.Modules.tick(mc);
        });

        LOG.info("Vex Client mod loaded");
    }

    /**
     * Adds a full-width "Vex Client" button to a menu: on the pause menu right under
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
                net.minecraft.network.chat.Component.literal("Vex Client"),
                b -> mc.setScreen(new net.vexclient.mod.gui.VexMenuScreen(screen))).bounds(x, insertY, width, 20).build());
    }

}
