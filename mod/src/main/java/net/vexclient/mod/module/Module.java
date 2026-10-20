package net.vexclient.mod.module;

import net.minecraft.client.Minecraft;

import java.util.ArrayList;
import java.util.List;

/**
 * A feature that can be switched on and off, with its own settings and keybind.
 * Add new features by extending this class and registering them in {@link Modules#init()}.
 */
public abstract class Module {
    public enum Category {
        CLIENT("Client"), COMBAT("Combat"), MISC("Misc");
        public final String label;
        Category(String label) { this.label = label; }
    }

    public final String id;
    public final String name;
    public final String description;
    public final Category category;
    /** Works only in singleplayer worlds (including a LAN world you host). */
    public final boolean singleplayerOnly;
    private boolean enabled;
    /** GLFW key code, -1 = none. */
    public int key = -1;
    public final List<Setting<?>> settings = new ArrayList<>();

    protected Module(String id, String name, String description, Category category, boolean singleplayerOnly) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.category = category;
        this.singleplayerOnly = singleplayerOnly;
    }

    protected <S extends Setting<?>> S add(S s) { settings.add(s); return s; }

    public boolean isEnabled() { return enabled; }

    /** True when the module is on AND allowed here (singleplayer-only modules are off on servers). */
    public boolean isActive() { return enabled && (!singleplayerOnly || allowedHere()); }

    public static boolean allowedHere() {
        Minecraft mc = Minecraft.getInstance();
        return mc.hasSingleplayerServer();
    }

    public void setEnabled(boolean on) {
        if (on == enabled) return;
        enabled = on;
        if (on) onEnable(); else onDisable();
    }

    public void toggle() { setEnabled(!enabled); }

    protected void onEnable() {}
    protected void onDisable() {}
    /** Every client tick while enabled. */
    public void tick(Minecraft mc) {}

    void loadEnabled(boolean on) { enabled = on; }

    /** For constructors: start switched on (before any saved state is loaded). */
    protected void enabledByDefault() { enabled = true; }
}
