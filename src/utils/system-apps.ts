/**
 * Default user-facing system applications that should be displayed separately
 * in the "System Applications" section of the installed apps tab.
 * 
 * These apps:
 * - Are shown at the top in a dedicated section
 * - Cannot be uninstalled
 * - Are not repeated in the regular installed apps list
 * - Only shown if actually installed on the device
 */

export interface SystemApp {
  name: string;
  packageName: string;
  /** For device-specific apps (e.g., A16 uses Google Messages instead of Samsung Messages) */
  alternativePackageName?: string;
  /** Device models where the alternative should be used */
  useAlternativeFor?: string[];
}

export const DEFAULT_SYSTEM_APPS: SystemApp[] = [
  
  {
    name: "Camera",
    packageName: "com.sec.android.app.camera"
  },
  {
    name: "Settings",
    packageName: "com.techless.wiseos" // WiseOS replaces Android Settings
  },
  {
    name: "Messages",
    packageName: "com.samsung.android.messaging",
    alternativePackageName: "com.google.android.apps.messaging",
    useAlternativeFor: ["A16"] // Samsung A16 uses Google Messages
  },
  {
    name: "Phone",
    packageName: "com.samsung.android.dialer"
  },
  {
    name: "My Files",
    packageName: "com.sec.android.app.myfiles",
    alternativePackageName: "com.samsung.android.app.myfiles"
  },
  {
    name: "Contacts",
    packageName: "com.samsung.android.contacts",
    alternativePackageName: "com.samsung.android.app.contacts"
  },
  {
    name: "Calculator",
    packageName: "com.sec.android.app.popupcalculator",
    alternativePackageName: "com.samsung.android.calculator"
  },
  {
    name: "Calendar",
    packageName: "com.samsung.android.calendar",
    alternativePackageName: "com.samsung.android.app.calendar"
  },
  {
    name: "Clock",
    packageName: "com.sec.android.app.clockpackage",
    alternativePackageName: "com.samsung.android.app.clockpackage"
  },
  {
    name: "Gallery",
    packageName: "com.sec.android.gallery3d",
    alternativePackageName: "com.samsung.android.gallery3d"
  },
  {
    name: "Notes",
    packageName: "com.samsung.android.app.notes",
    alternativePackageName: "com.sec.android.app.notes"
  },
  {
    name: "Voice Recorder",
    packageName: "com.sec.android.app.voicenote",
    alternativePackageName: "com.samsung.android.app.voicenote"
  },
  {
    name: "Smart Switch",
    packageName: "com.sec.android.easyMover",
    alternativePackageName: "com.samsung.android.smartswitch"
  },
  {
    name: "Galaxy Wearable",
    packageName: "com.samsung.android.app.watchmanager",
    alternativePackageName: "com.samsung.android.geargplugin"
  },
  {
    name: "Fossify Music Player",
    packageName: "org.fossify.musicplayer"
  },
  {
    name: "Microsoft OneDrive",
    packageName: "com.microsoft.skydrive"
  },
  {
    name: "2FA Authenticator (2FAS)",
    packageName: "com.twofasapp"
  }
];

/**
 * Get the package names of all system apps (including alternatives)
 * This is used to filter them out from the regular installed apps list
 */
export function getSystemAppPackageNames(): string[] {
  const packageNames: string[] = [];
  
  DEFAULT_SYSTEM_APPS.forEach(app => {
    packageNames.push(app.packageName);
    if (app.alternativePackageName) {
      packageNames.push(app.alternativePackageName);
    }
  });
  
  return packageNames;
}

/**
 * Determine which system apps are installed on the device
 * 
 * @param installedApps - List of all installed apps from Knox
 * @param deviceModel - Device model (e.g., "A16") for device-specific apps
 * @returns Array of installed system apps with their actual package names
 */
export function getInstalledSystemApps(
  installedApps: Array<{ packageName: string; appName: string }>,
  deviceModel?: string
): Array<{ name: string; packageName: string; isSystemApp: true }> {
  const installedSystemApps: Array<{ name: string; packageName: string; isSystemApp: true }> = [];
  
  console.log("\n" + "=".repeat(80));
  console.log("🔍 CHECKING FOR SYSTEM APPS");
  console.log("=".repeat(80));
  console.log(`📱 Device Model: ${deviceModel || "Not provided"}`);
  console.log(`📦 Total installed apps from Knox: ${installedApps.length}`);
  
  // Specifically check for Calculator
  const calculatorCheck = installedApps.filter(app => 
    app.packageName.includes("calculator") || 
    app.appName?.toLowerCase().includes("calculator")
  );
  
  if (calculatorCheck.length > 0) {
    console.log("\n🧮 Calculator related apps found in Knox:");
    calculatorCheck.forEach(app => {
      console.log(`   • ${app.packageName} - "${app.appName}"`);
    });
  } else {
    console.log("\n🧮 No Calculator related apps found in Knox list!");
  }
  
  // Specifically check for Calendar
  const calendarCheck = installedApps.filter(app => 
    app.packageName.includes("calendar") || 
    app.appName?.toLowerCase().includes("calendar")
  );
  
  if (calendarCheck.length > 0) {
    console.log("\n📅 Calendar related apps found in Knox:");
    calendarCheck.forEach(app => {
      console.log(`   • ${app.packageName} - "${app.appName}"`);
    });
  } else {
    console.log("\n📅 No Calendar related apps found in Knox list!");
  }
  
  // Specifically check for Voice Recorder
  const voiceRecorderCheck = installedApps.filter(app => 
    app.packageName.includes("voicenote") || 
    app.appName?.toLowerCase().includes("voice") ||
    app.appName?.toLowerCase().includes("recorder")
  );
  
  if (voiceRecorderCheck.length > 0) {
    console.log("\n🎤 Voice Recorder related apps found in Knox:");
    voiceRecorderCheck.forEach(app => {
      console.log(`   • ${app.packageName} - "${app.appName}"`);
    });
  } else {
    console.log("\n🎤 No Voice Recorder related apps found in Knox list!");
  }
  console.log("");
  
  DEFAULT_SYSTEM_APPS.forEach(systemApp => {
    let packageToCheck = systemApp.packageName;
    let foundPackage: string | null = null;
    
    // For device-specific alternatives (like A16 using Google Messages)
    if (
      systemApp.alternativePackageName && 
      systemApp.useAlternativeFor && 
      deviceModel && 
      systemApp.useAlternativeFor.some(model => deviceModel.toUpperCase().includes(model))
    ) {
      packageToCheck = systemApp.alternativePackageName;
      console.log(`   🔄 Device-specific alternative for ${systemApp.name}: ${packageToCheck}`);
    }
    
    // Check if primary package is installed
    if (installedApps.some(app => app.packageName === packageToCheck)) {
      foundPackage = packageToCheck;
    } 
    // If not found and there's an alternative, check the alternative too
    else if (systemApp.alternativePackageName && !systemApp.useAlternativeFor) {
      if (installedApps.some(app => app.packageName === systemApp.alternativePackageName)) {
        foundPackage = systemApp.alternativePackageName;
        console.log(`   🔄 Found alternative package for ${systemApp.name}: ${foundPackage}`);
      }
    }
    
    if (foundPackage) {
      console.log(`   ✅ Found: ${systemApp.name} (${foundPackage})`);
      installedSystemApps.push({
        name: systemApp.name,
        packageName: foundPackage,
        isSystemApp: true
      });
    } else {
      const packagesToCheck = [systemApp.packageName];
      if (systemApp.alternativePackageName) {
        packagesToCheck.push(systemApp.alternativePackageName);
      }
      
      // Extra logging for Calculator and Calendar
      if (systemApp.name === "Calculator" || systemApp.name === "Calendar") {
        console.log(`   ❌ NOT FOUND: ${systemApp.name}`);
        console.log(`      Looking for: ${packagesToCheck.join(" OR ")}`);
        
        // Check if any similar package exists
        const similar = installedApps.filter(app => 
          app.packageName.toLowerCase().includes(systemApp.name.toLowerCase())
        );
        if (similar.length > 0) {
          console.log(`      Similar packages found:`);
          similar.forEach(app => console.log(`         • ${app.packageName}`));
        }
      } else {
        console.log(`   ❌ Not found: ${systemApp.name} (checked: ${packagesToCheck.join(", ")})`);
      }
    }
  });
  
  console.log(`\n✨ Total system apps found: ${installedSystemApps.length}`);
  
  return installedSystemApps;
}

