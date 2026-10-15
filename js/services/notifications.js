export const createNotificationService = () => ({
  supported: () => "Notification" in globalThis,
  permission: () => ("Notification" in globalThis ? Notification.permission : "unsupported"),
  requestPermission: async () => {
    if (!("Notification" in globalThis)) return "unsupported";
    return Notification.requestPermission();
  },
  notify: async (title, options = {}) => {
    if (!("Notification" in globalThis) || Notification.permission !== "granted") return false;
    new Notification(title, options);
    return true;
  }
});
