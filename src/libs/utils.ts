export const navigateByKeyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement & { localName: string };
  // Check if the focus is not on an input element
  if (
    !(
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      target?.localName === "trix-editor"
    )
  ) {
    if (event.key === "1") {
      window.location.href = "/dashboard";
    } else if (event.key === "2") {
      window.location.href = "/dashboard/posts";
    } else if (event.key === "3") {
      window.location.href = "/dashboard/contacts";
    }
  }
};

export const setupKeyboardNavigation = () => {
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    navigateByKeyboard(event);
  });
};

export type Feature = {
  knoxManageId: string;
  lucideIcon: string;
  isEnabled: boolean;
  name: string;
  description: string;
  enableMessage: string;
  disableMessage: string;
  isBeta?: boolean;
};

export const KNOX_USER_GROUPS = {
  ADD_ON_DEV: "e469793fe25349a78ac3a73f71029099",
  ADD_ON_FOSSIFY_APPS: "c7ab2ff7da4b47ea86bc13ff173109a0",
  ADD_ON_FAITH_TOOLS: "5ae84219a2ea4372a42f9da57c00d325",
  ADD_ON_DISABLE_HOTSPOT: "f463ade53b1f43f5bf2f540a99395c2d",
  ADD_ON_GOOGLE_APPS: "2023496b363e4a639a379fe5efedd171",
  HEALTHY: "b3a3157829d94bf4bbbcd229c137ffbe",
  MINIMAL: "1bd53a63998245e69d190612e7ae5b39",
  PRO: "300830f61c574b9db37dabbae1e79aa9",
  UNPAID: "caf62603de4646a784cddb4e63e653d1"
} as Record<string, string>;

export const FEATURES: Record<string, Feature> = {
  TOOL_DRAWER: {
    knoxManageId: KNOX_USER_GROUPS.PRO,
    lucideIcon: "wrench",
    isEnabled: true,
    isBeta: true,
    name: "Tool Drawer*",
    description:
      "Access safe, vetted third-party apps. A collection of practical apps that avoid addiction and distraction.",
    enableMessage:
      "Third-party apps may display in-app ads, content, and experiences not managed by Techless. Enable Tool Drawer apps at your discretion. If you are battling addiction, we recommend not enabling the Tool Drawer.",
    disableMessage:
      "I acknowledge turning off this feature will remove access to third-party apps on this device. Any installed third-party apps will be uninstalled."
  },
  FAITH_TOOLS: {
    isEnabled: true,
    knoxManageId: KNOX_USER_GROUPS.ADD_ON_FAITH_TOOLS,
    lucideIcon: "fish-symbol",
    name: "Apps curated by faith.tools**",
    isBeta: true,
    description: "Access faith-based apps curated by faith.tools. Bible, YouVersion, Hallow, Dwell and more.",
    enableMessage:
      "Apps curated by faith.tools may display in-app ads and content not affiliated with or curated by Techless. These apps are curated by our partner, faith.tools.",
    disableMessage:
      "I acknowledge turning off this feature will remove access to faith-based apps on this device. Any installed faith-based apps will be uninstalled."
  },
  GOOGLE_APPS: {
    isEnabled: true,
    knoxManageId: KNOX_USER_GROUPS.ADD_ON_GOOGLE_APPS,
    lucideIcon: "layout-grid",
    name: "Google Apps",
    description: "Get access to Google Messages, Google Maps, and Google Photos.",
    enableMessage:
      "I acknowledge turning on this feature allows access to Google Messages, Maps, and Photos on this device. At this time Google Messages has Gemini AI available to chat with, so please use caution when making this decision.",
    disableMessage:
      "I acknowledge turning off this feature removes access to Google Messages, Maps, and Photos on this device immediately."
  },
  NO_HOTSPOT: {
    isEnabled: true,
    knoxManageId: KNOX_USER_GROUPS.ADD_ON_DISABLE_HOTSPOT,
    lucideIcon: "signal",
    name: "Disable Hotspot",
    description: "Disable the hotspot feature on this device.",
    enableMessage: "I acknowledge turning on this feature disables the hotspot feature on this device.",
    disableMessage: "I acknowledge turning off this feature allows hotspot to be used on this device."
  }
};

/**
 * These groups are exclusive, meaning they cannot be used in conjunction with one another without conflicts.
 */
export const oldKnoxUserGroupsForSubscription = new Set<string>([
  // @TODO: Pro will later become "Add-on - WPII - Tool Drawer"
  KNOX_USER_GROUPS.PRO,
  // @TODO: Minimal will later become "Add-on - WPII - Subscribed"
  KNOX_USER_GROUPS.MINIMAL,
  // @TODO: Everyone in healthy will need to be moved to "Add-on - WPII - Tool Drawer". Then, remove it.
  KNOX_USER_GROUPS.HEALTHY,
  // @TODO: Can this be removed entirely because the Organization has Unpaid rules by default?
  KNOX_USER_GROUPS.UNPAID
]);

export const getAlpineDataObject = (sourceDataElement: HTMLElement) => {
  return window.Alpine.$data(sourceDataElement) as Record<string, unknown>;
};

export const updateUnreachableAlpineState = ({
  sourceDataElement,
  key,
  value
}: {
  sourceDataElement: HTMLElement;
  key: string;
  value: any;
}) => {
  const dataObject = getAlpineDataObject(sourceDataElement);
  dataObject[key] = value;
};
