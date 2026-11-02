/** After the work page's list sheet closes: the edition's ISBN to open, or null to stay on the work page.
 * Follows only a picked edition that ended up on a list, whether Done added it or it was already there. */
export const editionToOpen = (pickedIsbn: string | null, listedAfterDone: boolean): string | null =>
  pickedIsbn && listedAfterDone ? pickedIsbn : null;
