package net.vexclient.mod.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.vexclient.mod.online.VexOnline;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Grey V in front of VEX players' names above their heads (only on your screen, never sent to a server). */
@Mixin(Player.class)
public abstract class PlayerMixin {
    @ModifyReturnValue(method = "getDisplayName", at = @At("RETURN"))
    private Component vexclient$badge(Component name) {
        Player self = (Player) (Object) this;
        if (!(self.level() instanceof ClientLevel)) return name; // the built-in server of a singleplayer world: leave chat etc. alone
        return VexOnline.badged(self.getUUID(), name);
    }
}
