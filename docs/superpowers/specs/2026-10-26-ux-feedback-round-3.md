# UX feedback, round 3 (2026-10-26)

Source: the owner's 22-item list, with their answers to follow-up questions. Item numbers are kept so the plan can cite them.

1. The footer doesn't act like a footer. Keep it centered, but it should sit at the bottom of the page, not float right after short content.
2. A work's series list should show small cover images.
3. Series is incomplete. https://shelfthread.com/work/OL15056578W (Tehanu) shows no series. https://shelfthread.com/work/OL59798W shows the series, but Tehanu links to /work/OL59847W, which opens as "Unknown title"; most entries do the same.
4. Lists and saves are the same thing. Remove Save and its sections in My Library. "Add to list" becomes "Save to list" with the save star. The "Choose a list" sheet gets a Cancel button next to Done.
5. Recommendations: show a loading indicator until it loads. With no recommendations, show "Not enough books or authors to make recommendations".
6. Recommendations use every saved (listed) book by default; a picker offers "All lists" and each list.
7. Recommendations feel old: children's fiction is mostly Shakespeare.
8. Import and Export get their own option in My Library.
9. List pages get export buttons.
10. Find Connection gets its own entry in My Library, where the user picks any two books by search. The page explains how it works.
11. Graph nodes get drop shadows so they read as buttons.
12. Hover text on nodes and other buttons, in concise, clear language saying what the button does.
13. On the graph page, the Filter, Graph/List and Share buttons line up.
14. Share copies just the link to the thing shown (e.g. https://shelfthread.com/graph/work/OL64034W), not a title, a bookexplorer:// link and an Open Library link.
15. Twitter cards and other link-preview metadata, with an image when there is one. Hosting: one Droplet behind Cloudflare. Caddy serves the static web build from /var/www/shelfthread; the Fastify server only serves api.shelfthread.com.
16. In the graph's list view, make it clear that tapping an item opens that item's page.
17. The Lord of the Rings series lists what look like chapters: books 1–3 twice, then more.
18. Work page: center the cover, title, author and rating. The only buttons are Share, Save to list, View as Graph and Find Connection.
19. Find Connection is missing the "Try Again" option. It lives on the unmerged graph-list-a11y branch; merge the whole branch.
20. My Library always shows as the shelf icon, including on the home page.
21. The app title appears twice on the home page; remove the top (header) one.
22. The "add your library" hint points the user to My Library → Settings.
