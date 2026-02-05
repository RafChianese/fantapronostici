// Native (Capacitor) rewarded ads via AdMob.
// Safe on web: dynamic imports + early return when not native.

type Result = { shown: boolean; rewarded: boolean };

export async function showNativeRewardedAd(): Promise<Result> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor?.isNativePlatform?.()) {
      return { shown: false, rewarded: false };
    }

    const env: any = (import.meta as any).env || {};
    const adId: string | undefined = env.VITE_ADMOB_REWARDED_UNIT_ID;
    if (!adId) {
      return { shown: false, rewarded: false };
    }

    const admob: any = await import("@capacitor-community/admob");
    const AdMob = admob.AdMob;
    const RewardAdPluginEvents = admob.RewardAdPluginEvents;

    await AdMob.initialize();

    return await new Promise((resolve) => {
      let rewarded = false;
      let finished = false;
      const subs: any[] = [];

      const finish = async (shown: boolean) => {
        if (finished) return;
        finished = true;
        for (const s of subs) {
          try { await s?.remove?.(); } catch { /* ignore */ }
        }
        resolve({ shown, rewarded });
      };

      const timeout = setTimeout(() => {
        finish(false);
      }, 45000);

      try {
        subs.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          rewarded = true;
        }));
        subs.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          clearTimeout(timeout);
          finish(true);
        }));
        subs.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
          clearTimeout(timeout);
          finish(false);
        }));
        subs.push(AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
          clearTimeout(timeout);
          finish(false);
        }));
      } catch {
        // ignore
      }

      (async () => {
        try {
          await AdMob.prepareRewardVideoAd({ adId, isTesting: !!env.DEV });
          await AdMob.showRewardVideoAd();
          // If Dismissed doesn't fire for some reason, don't block forever.
          setTimeout(() => {
            clearTimeout(timeout);
            finish(true);
          }, 35000);
        } catch {
          clearTimeout(timeout);
          finish(false);
        }
      })();
    });
  } catch {
    return { shown: false, rewarded: false };
  }
}
