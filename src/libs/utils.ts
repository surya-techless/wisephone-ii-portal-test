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

export const WISEPHONE_FEATURES = [
  {
    knoxManageId: "300830f61c574b9db37dabbae1e79aa9",
    lucideIcon: "wrench",
    isEnabled: true,
    name: "Enable Tool Drawer",
    description: "Get access to safe, vetted third-party apps that are tools to help you get a job done."
  },
  {
    isEnabled: true,
    knoxManageId: "5ae84219a2ea4372a42f9da57c00d325",
    lucideIcon: "fish-symbol",
    name: "Enable faith.tools",
    description:
      "Get access to your favorite faith-based apps on the Tool Drawer, like the YouVersion Bible app and Hallow Prayer app."
  },
  {
    isEnabled: true,
    knoxManageId: "f463ade53b1f43f5bf2f540a99395c2d",
    lucideIcon: "signal",
    name: "Disable Hotspot",
    description: "Disable the hotspot feature on your device."
  }
];
