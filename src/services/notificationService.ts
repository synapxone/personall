export const notificationService = {
    async requestPermission(): Promise<boolean> {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        const result = await Notification.requestPermission();
        return result === 'granted';
    },

    async scheduleWorkoutReminder(hour: number, minute: number) {
        const granted = await this.requestPermission();
        if (!granted) return;
        // In a real app this would use a service worker with Web Push
        // For now, set a timeout for same-day reminder
        const now = new Date();
        const target = new Date();
        target.setHours(hour, minute, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const ms = target.getTime() - now.getTime();
        if (ms < 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                new Notification('Personall 💪', {
                    body: 'Hora do seu treino! Você consegue!',
                    icon: '/icons/icon-192.png',
                });
            }, ms);
        }
    },

    showInstantNotification(title: string, body: string) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icons/icon-192.png' });
        }
    },
};
