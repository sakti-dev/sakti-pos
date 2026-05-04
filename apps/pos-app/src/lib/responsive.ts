import { createSignal, onCleanup, onMount } from "solid-js";

const MOBILE_UA =
	/Android.*Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;
const TABLET_UA = /Android|iPad|Tablet/i;

export function useIsPhone() {
	const [isPhone, setIsPhone] = createSignal(false);

	const checkDevice = () => {
		const ua = navigator.userAgent;
		if (MOBILE_UA.test(ua)) {
			return true;
		}
		if (TABLET_UA.test(ua)) {
			return false;
		}
		return Math.min(window.innerWidth, window.innerHeight) < 600;
	};

	onMount(() => {
		setIsPhone(checkDevice());
		const handleResize = () => setIsPhone(checkDevice());
		window.addEventListener("resize", handleResize);
		onCleanup(() => window.removeEventListener("resize", handleResize));
	});

	return isPhone;
}

export function useIsLandscape() {
	const [landscape, setLandscape] = createSignal(false);

	const check = () => {
		setLandscape(window.innerWidth > window.innerHeight);
	};

	onMount(() => {
		check();
		window.addEventListener("resize", check);
		onCleanup(() => window.removeEventListener("resize", check));
	});

	return landscape;
}
