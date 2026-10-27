/** Callback ref that sets the browser hover tooltip. React Native Web host nodes are DOM elements; native nodes lack `setAttribute`, so this is a no-op there. */
export const titleRef = (text: string | undefined) => (el: unknown) => {
  if (text && el && typeof (el as Element).setAttribute === "function") (el as Element).setAttribute("title", text);
};
