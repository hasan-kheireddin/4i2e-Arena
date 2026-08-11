import { useTranslation } from "react-i18next";
import { isRtlLanguage } from "../i18n/language";

/**
 * Whether the active language reads right-to-left.
 *
 * CSS logical properties cover most mirroring on their own; this is for the
 * cases they can't reach — gesture maths, cursor-anchored popovers and
 * gradients, where the component has to know which way "forward" points.
 */
export function useIsRtl(): boolean {
  const { i18n } = useTranslation();
  return isRtlLanguage(i18n.language);
}
