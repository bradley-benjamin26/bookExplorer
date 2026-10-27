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
  return <Text style={styles.paragraph}>{children}</Text>;
}

export default function About() {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.article}>
        <Title>About This Project</Title>

        <Heading>The app itself</Heading>
        <P>
          Shelf Thread is an attempt to help readers find new books to read. The vision I had when starting this project
          was thinking of myself standing in front of my book shelves, trying to find what to read next. I could pick up a
          book I really like and see what might be similar that I might enjoy. Or, I could quickly scan a handful of my
          favorite books to see if I could find something new. The application is informed by the professional values of
          librarianship, such as user privacy, intellectual freedom, and equitable access to information. To that end, the
          app doesn't collect or use your data to try to infer what you want. That process is entirely in the reader's
          hands; they can choose different paths to go down to find something new. The app can try to surface connections
          between materials that might not be obvious. Again, it does this by using the subject terms available from the
          Online Library Catalog to find matches.
        </P>
        <P>
          Shelf Thread isn't intended to replace your current reader tracker; it's meant to help you create lists of your
          books and books you're interested in, and then add those lists to your preferred tracker. This way, Shelf Thread
          complements your existing tools rather than replacing them.
        </P>

        <Heading>The librarian side of things</Heading>
        <P>
          This is an under-development project by a librarian to explore how users interact with interfaces and the use of
          alternative interfaces, such as a visual graph interface rather than a standard catalog interface. How can an
          interface based on visual relationships be accessible? What are readers' expectations for an interface nowadays?
          What do they expect it to be like when they search for a book in a library for the first time?
        </P>

        <Heading>The technical side of things</Heading>
        <P>
          This project also explores the technical aspects of building agentic software, including the use of test-driven
          and spec-driven development to guide the coding process and reduce errors. As an open project, the code is open
          source, so others can contribute or take the code and put their own spin on it. It is also designed to try to
          work with different systems.
        </P>

        <Title>The Library Feature</Title>
        <P>
          In my day job, I pretty much exclusively work to find how to help users find books and help them get their hands
          on that book. Whether it is finding something they could pick up at the library they're already in, or helping
          them find something they thought they couldn't get. This app is also intended to help you find where to get
          those books too.
        </P>

        <Heading>Locating books in your local library</Heading>
        <P>
          The main feature to do this is the feature to locate books in your local library. Within the app's My Library
          section, there is a way to add local library links. To do this you just need to go to your library's website and
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

        <Heading>Other options to access books</Heading>
        <P>
          There are currently two other ways to hopefully get the book. First, there's Open Library. Open Library is a
          community catalog, and it freely provides data for things like this app. Its main purpose, however, is to
          provide access to books. Now it doesn't provide access to everything, but you might be able to sign up and check
          out a book for free through that system. The service is called digital lending. In essence it means that someone
          could lend a digital version of a book they own and don't use or lend out. You can borrow those ebooks just like
          you might from your library's Libby, Overdrive, or Hoopla.
        </P>
        <P>
          Finally the app links to a search in bookshop.org. Bookshop.org is a great site for buying both new and used
          books from bookstores. You can even get e-books. The store supports local bookstores, so you can search for your
          local store on the site, and your purchase will help those brick and mortar book-retreats.
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
    paragraph: {
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      lineHeight: typeScale.sm * 1.6,
      color: colors.ink,
      marginBottom: spacing.md,
    },
  });
}
