/**
 * Android KeyEvent codes used by the Android TV Remote Service v2 protocol.
 * Reference: developer.android.com/reference/android/view/KeyEvent
 */
export const KeyCode = {
  POWER: 26,

  HOME: 3,
  BACK: 4,
  MENU: 82,
  TV_INPUT: 178,
  GUIDE: 172,
  TV_CONTENTS_MENU: 256,

  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,

  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  VOLUME_MUTE: 164,

  CHANNEL_UP: 166,
  CHANNEL_DOWN: 167,

  MEDIA_PLAY: 126,
  MEDIA_PAUSE: 127,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_STOP: 86,
  MEDIA_REWIND: 89,
  MEDIA_FAST_FORWARD: 90,
  MEDIA_PREVIOUS: 88,
  MEDIA_NEXT: 87,

  NUM_0: 7,
  NUM_1: 8,
  NUM_2: 9,
  NUM_3: 10,
  NUM_4: 11,
  NUM_5: 12,
  NUM_6: 13,
  NUM_7: 14,
  NUM_8: 15,
  NUM_9: 16,
} as const;

/** Logical button names used by the UI. Maps to Android KeyEvent codes. */
export type ButtonName =
  | 'Power'
  | 'Input'
  | 'Home'
  | 'Back'
  | 'Menu'
  | 'Guide'
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'Ok'
  | 'VolumeUp'
  | 'VolumeDown'
  | 'Mute'
  | 'ChannelUp'
  | 'ChannelDown'
  | 'Play'
  | 'Pause'
  | 'Stop'
  | 'Rewind'
  | 'FastForward'
  | 'Netflix'
  | 'GooglePlay'
  | 'Exit'
  | 'Num0'
  | 'Num1'
  | 'Num2'
  | 'Num3'
  | 'Num4'
  | 'Num5'
  | 'Num6'
  | 'Num7'
  | 'Num8'
  | 'Num9';

export const BUTTON_KEYCODE: Record<ButtonName, number> = {
  Power: KeyCode.POWER,
  Input: KeyCode.TV_INPUT,
  Home: KeyCode.HOME,
  Back: KeyCode.BACK,
  Menu: KeyCode.MENU,
  Guide: KeyCode.GUIDE,
  Up: KeyCode.DPAD_UP,
  Down: KeyCode.DPAD_DOWN,
  Left: KeyCode.DPAD_LEFT,
  Right: KeyCode.DPAD_RIGHT,
  Ok: KeyCode.DPAD_CENTER,
  VolumeUp: KeyCode.VOLUME_UP,
  VolumeDown: KeyCode.VOLUME_DOWN,
  Mute: KeyCode.VOLUME_MUTE,
  ChannelUp: KeyCode.CHANNEL_UP,
  ChannelDown: KeyCode.CHANNEL_DOWN,
  Play: KeyCode.MEDIA_PLAY,
  Pause: KeyCode.MEDIA_PAUSE,
  Stop: KeyCode.MEDIA_STOP,
  Rewind: KeyCode.MEDIA_REWIND,
  FastForward: KeyCode.MEDIA_FAST_FORWARD,
  // Netflix and Google Play don't have a single global KeyEvent across all TVs.
  // We treat them as no-op KeyCode = 0 and the UI will deep-link via app intents
  // in the future; for now they fall back to HOME (still better than nothing).
  Netflix: KeyCode.HOME,
  GooglePlay: KeyCode.HOME,
  Exit: KeyCode.BACK,
  Num0: KeyCode.NUM_0,
  Num1: KeyCode.NUM_1,
  Num2: KeyCode.NUM_2,
  Num3: KeyCode.NUM_3,
  Num4: KeyCode.NUM_4,
  Num5: KeyCode.NUM_5,
  Num6: KeyCode.NUM_6,
  Num7: KeyCode.NUM_7,
  Num8: KeyCode.NUM_8,
  Num9: KeyCode.NUM_9,
};
