import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Footer } from "../src/components/Footer";
import { useThemedStyles, type Theme } from "../src/theme";

function Title({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

function Heading({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

function P({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={[styles.bodyText, styles.paragraph]}>{children}</Text>;
}

function BulletList({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View role="list" style={styles.list}>{children}</View>;
}

function BulletItem({ children, details }: { children: ReactNode; details?: readonly string[] }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View role="listitem" style={styles.listItem}>
      <View style={styles.listRow}>
        <Text style={[styles.bodyText, styles.bullet]} aria-hidden={true}>{"\u2022"}</Text>
        <Text style={[styles.bodyText, styles.listText, styles.listLabel]}>{children}</Text>
      </View>
      {details && (
        <View role="list" style={styles.subList}>
          {details.map((detail) => (
            <View key={detail} role="listitem" style={styles.listRow}>
              <Text style={[styles.bodyText, styles.bullet]} aria-hidden={true}>{"\u25e6"}</Text>
              <Text style={[styles.bodyText, styles.listText]}>{detail}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function About() {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.article}>
        <Title>About Shelf Thread</Title>
        <Heading>What is it?</Heading>
        <P>
          Shelf Thread is designed for those times you're stuck looking at a shelf of books and don't know what to read next.
          Using the app you can scan the barcodes of books to create lists, explore related books, find connections, and get recommendations.
          To make recommendations, Shelf Thread uses data from sources like the Library of Congress, Wikidata, and Open Library to make connections
          rather than using cookies or and trackers.
        </P>
        <Heading>The Homepage</Heading>
        <P>
          The homepage provides an option to scan book barcodes using your phone as well as an option to search for books using title, author, or ISBN.
          It also is a place to find your browsing history so you can easily revist something you've been looking at previously.
        </P>

        <Heading>The Graph View</Heading>
        <P>
          The graph view is the core of Shelf Thread. These pages show all the different connections and allow you to explore them. If you
          scan an ISBN you can see the subjects, author, awards, and other information displayed as a visual. You can then tap the different nodes to see new
          connections. This way, you can find something new by going down a rabbit hole of subject terms or genres.
        </P>
        <P>
          You can switch between a list and graph view. The list view provides a more accessible way to navigate the connections by organizing everything into
          a list.
        </P>

        <Heading>My Library</Heading>
        <P>
          The shelf icon in the top right of the app directs you to the My Library section, with five
          sections:
        </P>
        <BulletList>
          <BulletItem details={[
            "Here you can view and create new lists. You can also export files to upload into another system.",
          ]}>Lists</BulletItem>
          <BulletItem details={[
            "This section allows you to find recommendations based on your saved lists. You can choose to get recommendations for an individual list or for everything you have saved.",
          ]}>Recommendations</BulletItem>
          <BulletItem details={[
            "This allows you to enter in books or authors to find connections between them. The system reviews relevant data and tries to find the shortest connection between the two.",
          ]}>Find Connection</BulletItem>
          <BulletItem details={[
            "Here you can export your lists and import lists. If you use multiple devices, exporting and importing lists enables you to keep your lists synchronized across devices.",
          ]}>Import &amp; Export</BulletItem>
          <BulletItem details={[
            "Here you can configure your preference for the light or dark view.",
            "It also allows you to add library links to try to find books in your local library. See below for more detailed instructions on what to do.",
          ]}>Settings</BulletItem>
        </BulletList>

        <Heading>Works, Books, Authors, and Subject</Heading>
        <P>
          These are the 4 primary entities that you can explore using Shelf Thread.
          Each has a separate page type dedicated to exploring and managing that entity. They each have an option
          to view the entity's graph representation or use the find connection feature.
        </P>
        <BulletList>
          <BulletItem details={[
            "A work is a page that contains all the various editions of a book. For example, you can find an audiobook edition or editions published in different years. It is also where some general information about the book exists. For example, you can see if the book is in series and what other works the author of that book has written.",
          ]}>Work</BulletItem>
          <BulletItem details={[
            "A book page contains information specific to a particular edition of a work. This includes details such as the publication date, format, and ISBN. You can add subjects, genres, formats, and notes to book pages. Before editing a book page, you need to save it to a list first. Book pages provide some options to try to find the book such as searching Open Library (which lends digital versions of books), WorldCat (which compiles what books across the country own), and an option to search and buy from Bookshop.org. If you have configured library links, you will also see the options to search your local library.",
          ]}>Book</BulletItem>
          <BulletItem details={[
            "An author page includes details such as the author's biography, list of works, and other relevant information. You can also find lists of what authors influence and author and who they themselves influnced. If they've won awards, you should be able to find them here too.",
          ]}>Author</BulletItem>
          <BulletItem details={[
            "These pages contain lists of books that can be organized by categories like most read and newest. A short description may also display if one can be found.",
          ]}>Subject</BulletItem>
        </BulletList>

        <Heading>Setting up the library links</Heading>
        <P>
          Within the app's My Library section, there is a way to add local library links. To do this you just need to go to your library's website and
          catalog to find how that system searches for ISBNs and titles.
        </P>
        <P>
          At my local public library, I do this by going to the library's home page. Towards the top of the screen is a
          link that reads "catalog." From there I look for anything mentioning "advanced search" or, in the case of my
          library, "more search options." From there I can click on advanced search. There are a number of boxes that
          appear. There are some boxes that say "any field," and from there I select "ISBN" and then I just type some
          gibberish. We just need to see what the URL looks like when you run the search. I go ahead and click go and the
          page updates with the search results (or in the case of my gibberish, no results).
        </P>
        <P>
          I look into the browser's URL address bar, highlight everything in the box, and then go to Shelf Thread. From
          there I go to the settings section and click "Add new library." I paste in the URL. Now, I look for where the
          gibberish I entered is located in the URL. In my case there is a section that says "term=asdfadsdafds"; you can
          probably tell what my gibberish was here. I delete everything after the equals sign and I put in {"{isbn}"} (the
          brackets and text). Then I leave everything else as is. This tells the system, when you're looking at a book, to
          put its ISBN into the URL. Then when you click on the library link option, you'll be directed to a search at your
          library. There's no guarantee it's there, but it might just be. And don't forget, you can always reach out to
          your library for help! You can repeat this process and instead do everything the same but for title, using{" "}
          {"{title}"}.
        </P>
      </View>
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, fonts, typeScale, spacing }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    // Long prose reads badly at desktop width, so the text column is capped.
    article: { width: "100%", maxWidth: 680, alignSelf: "center" },
    title: {
      fontFamily: fonts.display,
      fontSize: typeScale.xl,
      color: colors.ink,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading: {
      fontFamily: fonts.displayMedium,
      fontSize: typeScale.md,
      color: colors.ink,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    bodyText: {
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      lineHeight: typeScale.sm * 1.6,
      color: colors.ink,
    },
    paragraph: { marginBottom: spacing.md },
    list: { marginBottom: spacing.md, gap: spacing.md },
    listItem: { gap: spacing.xs },
    listRow: { flexDirection: "row", alignItems: "flex-start" },
    bullet: { width: spacing.xl, flexShrink: 0 },
    listText: { flex: 1, minWidth: 0 },
    listLabel: { fontFamily: fonts.bodyMedium },
    subList: { marginLeft: spacing.xl, gap: spacing.xs },
  });
}
