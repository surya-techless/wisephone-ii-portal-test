export type Feature = {
  knoxManageId: string;
  lucideIcon: string;
  isEnabled: boolean;
  name: string;
  description: string;
  enableMessage: string;
  disableMessage: string;
  /**
   * If true, the feature is inverse.
   * This means that the feature is enabled when the user does not have it, and disabled when the user has it.
   * For example, hotspot is enabled by default, and adding the user class to it disables the hotspot feature.
   * We want to say "Enable hotspot" versus "Disable hotspot" in the UI.
   */
  isInverse?: boolean;
  isBeta?: boolean;
  disclosure?: string;
};

export const KNOX_USER_GROUPS = {
  ADD_ON_DEV: "e469793fe25349a78ac3a73f71029099",
  ADD_ON_FOSSIFY_APPS: "c7ab2ff7da4b47ea86bc13ff173109a0",
  ADD_ON_FAITH_TOOLS: "5ae84219a2ea4372a42f9da57c00d325",
  ADD_ON_DISABLE_HOTSPOT: "f463ade53b1f43f5bf2f540a99395c2d",
  ADD_ON_GOOGLE_APPS: "2023496b363e4a639a379fe5efedd171",
  /**
   * @deprecated This is no longer used.
   */
  HEALTHY: "b3a3157829d94bf4bbbcd229c137ffbe",
  /**
   * @deprecated We instead use ADD_ON_SUBSCRIBED.
   */
  MINIMAL: "1bd53a63998245e69d190612e7ae5b39",
  /**
   * @deprecated We instead use ADD_ON_TOOL_DRAWER.
   */
  PRO: "300830f61c574b9db37dabbae1e79aa9",
  UNPAID: "caf62603de4646a784cddb4e63e653d1",
  // Used to be called PRO. This can stack on top of MINIMAL.
  ADD_ON_TOOL_DRAWER: "300830f61c574b9db37dabbae1e79aa9",
  // Used to be called MINIMAL
  SUBSCRIBED: "1bd53a63998245e69d190612e7ae5b39"
};

export const FEATURES: Record<string, Feature> = {
  TOOL_DRAWER: {
    knoxManageId: KNOX_USER_GROUPS.ADD_ON_TOOL_DRAWER,
    lucideIcon: "wrench",
    isEnabled: true,
    isBeta: true,
    name: "Tool Drawer",
    description:
      "Access safe, vetted third-party apps. A collection of practical apps that avoid addiction and distraction.",
    enableMessage:
      "Third-party apps may display in-app ads, content, and experiences not managed by Techless. Enable Tool Drawer apps at your discretion. If you are battling addiction, we recommend not enabling the Tool Drawer.",
    disableMessage:
      "I acknowledge turning off this feature will remove access to third-party apps on this device. Any installed third-party apps will be uninstalled.",
    disclosure:
      "Please note that third-party apps may display in-app ads, which are not endorsed by Techless and could contain unexpected content. Use of the Tool Drawer apps is at your discretion. If you are battling addiction, we recommend not enabling the Tool Drawer. And, at this time, in-app purchases are not supported."
  },
  FAITH_TOOLS: {
    isEnabled: true,
    knoxManageId: KNOX_USER_GROUPS.ADD_ON_FAITH_TOOLS,
    lucideIcon: "fish-symbol",
    name: "Apps curated by faith.tools",
    isBeta: true,
    description: "Access faith-based apps curated by faith.tools. Bible, YouVersion, Hallow, Dwell and more.",
    enableMessage:
      "Apps curated by faith.tools may display in-app ads and content not affiliated with or curated by Techless. These apps are curated by our partner, faith.tools.",
    disableMessage:
      "I acknowledge turning off this feature will remove access to faith-based apps on this device. Any installed faith-based apps will be uninstalled.",
    disclosure:
      "Apps curated by faith.tools may display in-app ads and content not affiliated with or curated by Techless. These apps are curated by our partner, faith.tools. And, at this time, in-app purchases are not supported."
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
    name: "Allow Hotspot",
    description:
      "This determines if the hotspot feature on this device is allowed. Requires a compatible service plan to use hotspot.",
    enableMessage: "I acknowledge turning on this feature enables the hotspot feature on this device.",
    disableMessage: "I acknowledge turning off this feature disables the hotspot feature on this device.",
    isInverse: true
  }
};

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

export const getPackageNameFromPlayStoreUrl = (playStoreUrl: string): string => {
  if (!playStoreUrl) {
    console.error("No play store url provided");
    return "";
  }

  try {
    const url = new URL(playStoreUrl);
    return url.searchParams.get("id") ?? "";
  } catch (error) {
    console.error(`Error getting package name from play store url: "${playStoreUrl}"`, error);
    return "";
  }
};

export const FAITH_TOOLS_APPS: { id: number; Name: string; "Play Store URL": string }[] = [
  {
    id: 3,
    Name: "YouVersion Bible App",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.sirma.mobile.bible.android&_branch_match_id=1261467625618907144&utm_source=Bible.com&utm_campaign=Quick%20Link%20-%20App%20Page%20-%20Android&utm_medium=quick-link&_branch_referrer=H4sIAAAAAAAAA8soKSkottLXTywo0EvKTMpJ1UvOzwXxdBPzUoryM1MAYUFTziEAAAA%3D"
  },
  {
    id: 5,
    Name: "GodTools",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.keynote.godtools.android&hl=en_US&gl=US"
  },
  {
    id: 6,
    Name: "Bible Answers AI",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.bibleanswersai.biblegpt"
  },
  {
    id: 10,
    Name: "Streetlights Bible",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.streetlightsbible.app&referrer=utm_source%3Dsubsplash%26utm_content%3DeyJoYW5kbGVyIjoiYXBwIiwiYXBwa2V5IjoiNEhIUUtOIn0="
  },
  {
    id: 11,
    Name: "ReadScripture",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.youmeforever.readscripture"
  },
  {
    id: 12,
    Name: "Enduring Word",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.enduringword.commentary"
  },
  {
    id: 15,
    Name: "Live From Rest",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.stevesmith.livefromrest"
  },
  {
    id: 17,
    Name: "Join the Journey",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.watermark.jtj_android&hl=en"
  },
  {
    id: 18,
    Name: "Dwell",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.dwellapp.dwell"
  },
  {
    id: 19,
    Name: "Soulspace Prayer & Meditation",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.chois.soulspace"
  },
  {
    id: 22,
    Name: "New City Catechism",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.crossway.newcitycatechism"
  },
  {
    id: 23,
    Name: "Bible App for Kids",
    "Play Store URL": "http://play.google.com/store/apps/details?id=com.bible.kids"
  },
  {
    id: 28,
    Name: "Versify",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.tarkowr.versify"
  },
  {
    id: 29,
    Name: "Abide",
    "Play Store URL": "https://play.google.com/store/apps/details?id=is.abide&pli=1"
  },
  {
    id: 30,
    Name: "Hallow",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.hallow.android"
  },
  {
    id: 32,
    Name: "Pray.com",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.prayapp.client"
  },
  {
    id: 33,
    Name: "Pray First",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.churchofthehighlands.prayfirst&hl=en_US&gl=US"
  },
  {
    id: 34,
    Name: "Prayminder",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.lionswool.prayminder"
  },
  {
    id: 35,
    Name: "Echo Prayer",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.cloversites.echo"
  },
  {
    id: 38,
    Name: "AlephBeta",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.alephbeta.android&hl=en_US"
  },
  {
    id: 41,
    Name: "First 5",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.crowdhub.first5"
  },
  {
    id: 43,
    Name: "First15",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.crowdhub.first15"
  },
  {
    id: 44,
    Name: "Through the Word",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.throughtheword.v2"
  },
  {
    id: 45,
    Name: "She Reads Truth",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.shereadstruth.shereadstruth"
  },
  {
    id: 46,
    Name: "He Reads Truth",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.shereadstruth.hereadstruth"
  },
  {
    id: 47,
    Name: "The Bible with Nicky and Pippa",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.multipie.bibleinoneyear&hl=en_GB"
  },
  {
    id: 48,
    Name: "Glorify",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en&id=com.glorify.app"
  },
  {
    id: 49,
    Name: "BibleProject",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.bibleproject"
  },
  {
    id: 50,
    Name: "Bible.is - Faith Comes By Hearing",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.faithcomesbyhearing.android.bibleis"
  },
  {
    id: 51,
    Name: "Literal Word Bible App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.literalword.mobile_app"
  },
  {
    id: 52,
    Name: "Bible Strong",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.smontlouis.biblestrong&pcampaignid=MKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
  },
  {
    id: 53,
    Name: "Canopy",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.canopy.vpn.filter.parent&hl=en_US"
  },
  {
    id: 54,
    Name: "Ever Accountable",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.everaccountable.android"
  },
  {
    id: 56,
    Name: "Bible App by Olive Tree",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=biblereader.olivetree"
  },
  {
    id: 58,
    Name: "Ascension App",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.ascension.app"
  },
  {
    id: 59,
    Name: "Logos Bible Study App",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.logos.androidlogos"
  },
  {
    id: 60,
    Name: "Spark Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.sparkbible.sparkbible"
  },
  {
    id: 61,
    Name: "Safar Discipleship",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.safarmobileapp"
  },
  {
    id: 64,
    Name: "Disciple Life App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.gcm.foundations"
  },
  {
    id: 69,
    Name: "Lectio 365",
    "Play Store URL": "https://play.google.com/store/apps/details/Lectio_365?hl=en_ZA&id=com.prayer247.lectio365"
  },
  {
    id: 71,
    Name: "Bible Kids App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=media.bcc.kids"
  },
  {
    id: 74,
    Name: "Got Questions",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.gotquestions.gqandapp"
  },
  {
    id: 76,
    Name: "Brilliant Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.brilliant.bible"
  },
  {
    id: 77,
    Name: "MissionHub",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.missionhub"
  },
  {
    id: 78,
    Name: "Perspective Cards",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=org.cru.perspective"
  },
  {
    id: 81,
    Name: "MessengerX",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_GB&id=com.messengerx"
  },
  {
    id: 82,
    Name: "ESV Bible App",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.subsplash.esv"
  },
  {
    id: 83,
    Name: "Blue Letter Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.blueletterbible.blb"
  },
  {
    id: 88,
    Name: "Jesus Film Project App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.jesusfilmmedia.android.jesusfilm"
  },
  {
    id: 91,
    Name: "her.BIBLE Women's Audio Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=org.cru.womans.herbible"
  },
  {
    id: 100,
    Name: "Called",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.called.app"
  },
  {
    id: 107,
    Name: "PrayerMate",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.geero.prayermate"
  },
  {
    id: 108,
    Name: "Common Prayer Canada",
    "Play Store URL": "https://play.google.com/store/apps/details?id=ca.prayerbook.pray"
  },
  {
    id: 111,
    Name: "Bible Brief",
    "Play Store URL": "https://play.google.com/store/apps/details?id=io.prismbible&pcampaignid=web_share"
  },
  {
    id: 118,
    Name: "WordGo",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.wordgo.app"
  },
  {
    id: 120,
    Name: "FaithFi - Faith & Finance",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.moneywise.app"
  },
  {
    id: 121,
    Name: "EveryDollar",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.everydollar.android"
  },
  {
    id: 122,
    Name: "AccessMore",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.emfbroadcasting.accessmore"
  },
  {
    id: 123,
    Name: "Air1",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.emf.air1"
  },
  {
    id: 124,
    Name: "K-LOVE",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.emf.klove"
  },
  {
    id: 125,
    Name: "Unceasing Worship",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.internationalhouseofprayer.unceasingworship"
  },
  {
    id: 126,
    Name: "Pray As You Go",
    "Play Store URL": "https://play.google.com/store/apps/details?id=pl.foxcode.prayasyougo"
  },
  {
    id: 129,
    Name: "Redeeming Time",
    "Play Store URL": "https://play.google.com/store/apps/details?id=tech.discipleship.redeemingTime"
  },
  {
    id: 132,
    Name: "Bible Gateway",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.csnmedia.android.bg&referrer=utm_source%3DBibleGateway_MainApp%26utm_campaign%3Dapppage"
  },
  {
    id: 134,
    Name: "Parent Cue App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.rethinkgroup.parentcuepaid"
  },
  {
    id: 150,
    Name: "One Minute Pause App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.ransomedheart.pause"
  },
  {
    id: 157,
    Name: "Tether",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.withtether.tether"
  },
  {
    id: 166,
    Name: "School Prayer Challenge",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.schoolprayerchallenge.schoolprayerchallenge"
  },
  {
    id: 167,
    Name: "BLESS App: Bless Your Neighbor",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.blesseveryhome.bealight"
  },
  {
    id: 171,
    Name: "audibible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.sevnapps.audibible"
  },
  {
    id: 230,
    Name: "The Waha Discovery Bible Study App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.kingdomstrategies.waha"
  },
  {
    id: 231,
    Name: "The Bible Memory App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.millennialsolutions.scripturetyper"
  },
  {
    id: 233,
    Name: "Wrinkly Bible Memory",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.oakwoodsc.wrinkly"
  },
  {
    id: 237,
    Name: "Faith Driven Entrepreneur",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.faithdriven"
  },
  {
    id: 238,
    Name: "Exodus 90 - Live Different",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.exodus90.app"
  },
  {
    id: 240,
    Name: "Neurocycle",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.switch_android&hl=en_US&gl=US"
  },
  {
    id: 241,
    Name: "The Word One to One",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.theword121.app"
  },
  {
    id: 242,
    Name: "Inner Room",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.innerroomapp&hl=en_GB&gl=US"
  },
  {
    id: 243,
    Name: "Salt + Light: Intentional Play",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.saltandlight"
  },
  {
    id: 245,
    Name: "LO sister : By Sadie Rob Huff",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.mightybell.losister"
  },
  {
    id: 246,
    Name: "Sola \u2014 Bible companion app",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.sola"
  },
  {
    id: 247,
    Name: "Reasonable Faith",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.subsplash.thechurchapp.reasonablefaith&referrer=utm_source%3Dsubsplash%26utm_content%3DeyJoYW5kbGVyIjoiYXBwIiwiYXBwa2V5IjoiTUdSREc4In0="
  },
  {
    id: 250,
    Name: "Restore + Revive Journal",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.lifestyleofprayer.rrjournal"
  },
  {
    id: 261,
    Name: "Free Christian eBook Reader",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.cornerstone.freechristianebooks"
  },
  {
    id: 262,
    Name: "Chirp Audiobooks",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.chirpbooks.chirp"
  },
  {
    id: 265,
    Name: "Faithlife Audio",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.logos.androidvyrso&referrer=utm_source%3Dfaithlifeebooks%26utm_medium%3Dweb%26utm_term%3Ddownloadlink"
  },
  {
    id: 266,
    Name: "Deaf Bible App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.faithcomesbyhearing.android.deaf.bibleis"
  },
  {
    id: 268,
    Name: "United Hive",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.unitedhive.app"
  },
  {
    id: 290,
    Name: "Bolls Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=life.bolls.bolls"
  },
  {
    id: 291,
    Name: "Remember Me",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.bible.remember_me"
  },
  {
    id: 294,
    Name: "Holy Reads",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.holyreads.app&hl=en_IN&gl=US"
  },
  {
    id: 299,
    Name: "CBN Radio",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.cbn.radio.christian.music.free.android.app"
  },
  {
    id: 300,
    Name: "CBN Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=air.com.cbn.android_bible&hl=en"
  },
  {
    id: 301,
    Name: "VOM App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.persecution.VomPrayerCalendar&pli=1"
  },
  {
    id: 310,
    Name: "LifeWay Women App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.lifewaywomen.lifewaywomen"
  },
  {
    id: 316,
    Name: "Gideon Bible App",
    "Play Store URL":
      "https://play.google.com/store/apps/details?hl=en_US&id=com.faithcomesbyhearing.gideons.android.bibleis"
  },
  {
    id: 325,
    Name: "Yarrow",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.yarrow.yarrow"
  },
  {
    id: 331,
    Name: "The Study Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.gty.macarthurstudybible"
  },
  {
    id: 363,
    Name: "PRAYR App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.prayr.prayrcommunity"
  },
  {
    id: 370,
    Name: "Concise Bible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=bible.concise.the"
  },
  {
    id: 393,
    Name: "Men's Ministries",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.subsplashconsulting.s_56J2J3"
  },
  {
    id: 396,
    Name: "Bible Engagement Project",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.ag.bep"
  },
  {
    id: 397,
    Name: "STRIVE",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.b65c834c98db.app"
  },
  {
    id: 450,
    Name: "Prayer Library",
    "Play Store URL": "https://play.google.com/store/apps/details?id=ca.prayer_library.twa"
  },
  {
    id: 484,
    Name: "Love God Greatly",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.subsplashconsulting.s_B3BP5J"
  },
  {
    id: 491,
    Name: "Tabella.app",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.jointabella.tabella"
  },
  {
    id: 493,
    Name: "Prayer Global",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.global.prayer"
  },
  {
    id: 496,
    Name: "QAVA TV",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.vhx.reveal"
  },
  {
    id: 501,
    Name: "Encountering Peace",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.crowdhubapps.encounter&hl=en_US&gl=US"
  },
  {
    id: 502,
    Name: "Reflect Christian Mindfulness",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=mycompany.christianmeditation"
  },
  {
    id: 503,
    Name: "Soultime Christian Meditation",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.soultime.app&hl=en_US"
  },
  {
    id: 504,
    Name: "Hope Mindfulness",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.hopemindfulness.hopemindfulness"
  },
  {
    id: 507,
    Name: "A Simple Pause",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.asimplepause.app&hl=en_US&gl=US"
  },
  {
    id: 508,
    Name: "The Quiet Collection",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.quietcollectionand"
  },
  {
    id: 510,
    Name: "Bible AI Search",
    "Play Store URL": "https://play.google.com/store/apps/details?id=bible.ai.search&hl=en&gl=US&pli=1"
  },
  {
    id: 513,
    Name: "Amen - Catholic Bible & Prayers",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.amenapp.amen&hl=en_US&gl=US"
  },
  {
    id: 518,
    Name: "d365",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.passport.d365"
  },
  {
    id: 520,
    Name: "Jesus Calling App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.thomasnelson.jesuscalling"
  },
  {
    id: 521,
    Name: "Study Gateway",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.hccp.studygateway"
  },
  {
    id: 523,
    Name: "Bible Portal",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.bibleportal.app.android"
  },
  {
    id: 526,
    Name: "Take Root",
    "Play Store URL": "https://play.google.com/store/apps/details?id=software.rooted.takeroot"
  },
  {
    id: 531,
    Name: "My Prayer Room",
    "Play Store URL": "https://play.google.com/store/apps/details?id=co.creativeparkmedia.myprayerroom"
  },
  {
    id: 532,
    Name: "Flare",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.flairtime.Flare&hl=en_US&gl=US"
  },
  {
    id: 533,
    Name: "Bible Chat",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.manifestautomation.biblechat&hl=en_US"
  },
  {
    id: 544,
    Name: "LifeBible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.tecarta.TecartaBible"
  },
  {
    id: 556,
    Name: "YNAB - You Need a Budget",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=com.youneedabudget.evergreen.app"
  },
  {
    id: 557,
    Name: "Goodbudget",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.dayspringtech.envelopes"
  },
  {
    id: 562,
    Name: "Spirit Speak AI",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.rivannatechnologies.spiritspeakai"
  },
  {
    id: 597,
    Name: "iEvangelize",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.tinochiwara.ievangelizeapp"
  },
  {
    id: 631,
    Name: "Arete7",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.arete7.app"
  },
  {
    id: 660,
    Name: "Lessons.Church",
    "Play Store URL": "https://play.google.com/store/apps/details?id=church.lessons.screen"
  },
  {
    id: 661,
    Name: "B1 Church",
    "Play Store URL": "https://play.google.com/store/apps/details?id=church.b1.mobile&hl=en_US"
  },
  {
    id: 662,
    Name: "Instill Kids Bedtime Prayer",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.instillapp"
  },
  {
    id: 725,
    Name: "ChMeetings",
    "Play Store URL": "https://play.google.com/store/apps/details?id=jiosdev.chmeetings.mobile"
  },
  {
    id: 792,
    Name: "Asaph",
    "Play Store URL": "https://play.google.com/store/apps/details?id=io.asaph"
  },
  {
    id: 799,
    Name: "Foster the City",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.fosterthecity.app&pcampaignid=web_share"
  },
  {
    id: 800,
    Name: "Bible Gateway",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.csnmedia.android.bg"
  },
  {
    id: 802,
    Name: "Pando App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.nexisit.pandoapp&hl=en_US&pli=1"
  },
  {
    id: 803,
    Name: "Christendom",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.christendom.www.twa"
  },
  {
    id: 805,
    Name: "World Prayer",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.world.prayer.app"
  },
  {
    id: 818,
    Name: "Love Nudge\u2122 Mobile App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.grootersproductions.challenge"
  },
  {
    id: 819,
    Name: "Focus on the Family App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.focusonthefamily.android.focusdaily&hl=en"
  },
  {
    id: 820,
    Name: "Gottman Card Decks",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.carddecks"
  },
  {
    id: 823,
    Name: "Life After Pornography Coach",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.getyourmarriageon.lap&hl=en&gl=US"
  },
  {
    id: 825,
    Name: "Praise Break",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.bridgeitsolutions.praisebreak"
  },
  {
    id: 826,
    Name: "AdelFi Banking",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.evangelicalchristiancreditunion5085.mobile&hl=en"
  },
  {
    id: 827,
    Name: "K-LOVE On Demand",
    "Play Store URL": "https://play.google.com/store/apps/details?hl=en_US&id=ott.kemf"
  },
  {
    id: 830,
    Name: "Missio",
    "Play Store URL": "https://play.google.com/store/apps/details?id=app.missio"
  },
  {
    id: 832,
    Name: "5fish",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.globalrecordings.fivefish"
  },
  {
    id: 834,
    Name: "Second Breath",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.secondbreathcenter.android"
  },
  {
    id: 843,
    Name: "Formed",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.ai.formed.formed&hl=en_US&gl=US"
  },
  {
    id: 844,
    Name: "Hide The Word",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.vanks.memorize"
  },
  {
    id: 893,
    Name: "Change The Map",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.mightybell.changethemap"
  },
  {
    id: 956,
    Name: "3-16",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.mycompany.threesixteen"
  },
  {
    id: 989,
    Name: "Encouraging Radio",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.thesmythgroup.snapdaddy.perradio&hl=en_US"
  },
  {
    id: 1024,
    Name: "Every Day with Jesus",
    "Play Store URL": "https://play.google.com/store/apps/details?id=org.waverleyabbey.edwj"
  },
  {
    id: 1025,
    Name: "Bible Notes",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.nixies.biblenotes&hl=en-IN"
  },
  {
    id: 1026,
    Name: "Pastor Notes App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.nathan.pastornotesapp"
  },
  {
    id: 1032,
    Name: "Following Jesus",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.customchurchapps.appazzfb19a&pcampaignid=web_share"
  },
  {
    id: 1034,
    Name: "Stargaze Christian Investing",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.stargazeapp.app&hl=en_US"
  },
  {
    id: 1037,
    Name: "Involv Chat",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.involv.login"
  },
  {
    id: 1039,
    Name: "Every Moment Holy Liturgy",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.brentwood.emh"
  },
  {
    id: 1056,
    Name: "Engage Spaces",
    "Play Store URL": "https://play.google.com/store/apps/details?id=engage.spaces"
  },
  {
    id: 1058,
    Name: "TheosU Online Biblical Teaching",
    "Play Store URL": "https://play.google.com/store/apps/details?id=tv.uscreen.theosu"
  },
  {
    id: 1088,
    Name: "Dear God - Prayer Diary",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.hellonamu.deargod.twa&pcampaignid=web_share"
  },
  {
    id: 1121,
    Name: "Discover",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=org.discoverapp&utm_source=homepage&utm_campaign=discoverapp"
  },
  {
    id: 1220,
    Name: "Olive Christian Radio",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.oliveradio.app"
  },
  {
    id: 1287,
    Name: "YourBible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.goodnewsuk.app&gl=GB"
  },
  {
    id: 1583,
    Name: "AndBible",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.bible.android.activity"
  },
  {
    id: 1650,
    Name: "helloHOPE",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.hellohope.app"
  },
  {
    id: 1748,
    Name: "Eirene - Christian Mental Wellbeing AI",
    "Play Store URL":
      "https://play.google.com/store/apps/details?id=com.thechristianmentalwellnessassistant.eirene&hl=en_US"
  },
  {
    id: 1848,
    Name: "GetSermons",
    "Play Store URL": "https://play.google.com/store/apps/details?id=ng.sermons.lumine.sermons_mobile_app"
  },
  {
    id: 1849,
    Name: "Stand to Reason",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.subsplash.thechurchapp.standtoreason"
  },
  {
    id: 1850,
    Name: "STR Quick-Reference App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.subsplash.thechurchapp.s_NNSJ48&hl=en_US"
  },
  {
    id: 1851,
    Name: "Wild at Heart",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.subsplash.thechurchapp.ransomedheart"
  },
  {
    id: 1853,
    Name: "Discovering Prayer",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.discoveringprayer.pocketabbey"
  },
  {
    id: 1981,
    Name: "Evergrace",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.tutusgumboots.evergrace"
  },
  {
    id: 2012,
    Name: "Ezra Bible App",
    "Play Store URL": "https://play.google.com/store/apps/details?id=net.ezrabibleapp.cordova"
  },
  {
    id: 2050,
    Name: "Daily Bible Devotion & Prayer",
    "Play Store URL": "https://play.google.com/store/apps/details?id=com.fishmy.android"
  }
];
