package net.vexclient.mod.module.impl;

import net.vexclient.mod.module.Module;

/** See in the dark: the light map uses full brightness (see LightTextureMixin). */
public final class FullbrightModule extends Module {
    public FullbrightModule() { super("fullbright", "Fullbright", "Everything is lit as if it were day, like a permanent night-vision effect.", Category.MISC, false); }
}
