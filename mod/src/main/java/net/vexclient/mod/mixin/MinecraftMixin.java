package net.vexclient.mod.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.vexclient.mod.module.Modules;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Player ESP: other players get the glowing outline (only while the module is allowed, i.e. singleplayer). */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @ModifyReturnValue(method = "shouldEntityAppearGlowing", at = @At("RETURN"))
    private boolean vexclient$esp(boolean glowing, Entity entity) {
        if (glowing) return true;
        Minecraft mc = (Minecraft) (Object) this;
        return Modules.playerEsp != null && Modules.playerEsp.isActive() && entity instanceof Player && entity != mc.player;
    }
}
