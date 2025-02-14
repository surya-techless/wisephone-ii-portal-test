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
};

export const FEATURES: Record<string, Feature> = {
  TOOL_DRAWER: {
    knoxManageId: "300830f61c574b9db37dabbae1e79aa9",
    lucideIcon: "wrench",
    isEnabled: true,
    name: "Enable Tool Drawer",
    description: "Get access to safe, vetted third-party apps that are tools to help you get a job done.",
    enableMessage:
      "I acknowledge turning on this feature will allow access to third-party apps on this device. (Be aware, we do not recommend this for those battling sexual addiction.)",
    disableMessage:
      "I acknowledge turning off this feature will remove access to third-party apps on this device. Any installed third-party apps will be uninstalled."
  },
  FAITH_TOOLS: {
    isEnabled: true,
    knoxManageId: "5ae84219a2ea4372a42f9da57c00d325",
    lucideIcon: "fish-symbol",
    name: "Enable faith.tools (beta)",
    description:
      "Get access to faith-based apps in the Tool Drawer, curated by faith.tools. YouVersion, Hallow, Dwell, and more.",
    enableMessage: "I acknowledge turning on this feature allows access to faith-based apps on this device.",
    disableMessage:
      "I acknowledge turning off this feature will remove access to faith-based apps on this device. Any installed faith-based apps will be uninstalled."
  },
  GOOGLE_APPS: {
    isEnabled: true,
    knoxManageId: "2023496b363e4a639a379fe5efedd171",
    lucideIcon: "layout-grid",
    name: "Enable Google Apps",
    description: "Get access to Google Messages, Google Maps, and Google Photos.",
    enableMessage:
      "I acknowledge turning on this feature allows access to Google Messages, Maps, and Photos on this device. At this time Google Messages has Gemini AI available to chat with, so please use caution when making this decision.",
    disableMessage:
      "I acknowledge turning off this feature removes access to Google Messages, Maps, and Photos on this device immediately."
  },
  NO_HOTSPOT: {
    isEnabled: true,
    knoxManageId: "f463ade53b1f43f5bf2f540a99395c2d",
    lucideIcon: "signal",
    name: "Disable Hotspot",
    description: "Disable the hotspot feature on this device.",
    enableMessage: "I acknowledge turning on this feature disables the hotspot feature on this device.",
    disableMessage: "I acknowledge turning off this feature allows hotspot to be used on this device."
  }
};

export const UNPAID_GROUP_ID = "caf62603de4646a784cddb4e63e653d1";

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
