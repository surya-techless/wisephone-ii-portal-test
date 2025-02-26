import type { Alpine } from "alpinejs";
// @ts-ignore - Has no associated types.
import intersect from "@alpinejs/intersect";
// @ts-ignore - Has no associated types.
import persist from "@alpinejs/persist";
// @ts-ignore - Has no associated types.
import collapse from "@alpinejs/collapse";
// @ts-ignore - Has no associated types.
import mask from "@alpinejs/mask";
// @ts-ignore - Has no associated types.
import focus from "@alpinejs/focus";

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);
  Alpine.plugin(persist);
  Alpine.plugin(collapse);
  Alpine.plugin(mask);
  Alpine.plugin(focus);
};
