import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp from "sharp";
import { siteConfig } from "../../config/site";

const WIDTH = 1200;
const HEIGHT = 630;
const DISPLAY_FONT = "Space Grotesk";
const MONO_FONT = "JetBrains Mono";

const colors = {
  white: "#ffffff",
  stone300: "#d6d3d1",
  stone800: "#292524",
  stone900: "#1c1917",
  ember600: "#c2410c",
  ember950: "#3b1106",
};

type OgProps = {
  title: string;
  type: "Portfolio" | "Blog" | "Project" | "Note" | "About" | "Contact";
  description?: string;
  metaItems?: string[];
};

type FontSpec = {
  name: string;
  weight: 500 | 700;
  url: string;
  fallbackPath: string;
};

const fontSpecs: FontSpec[] = [
  {
    name: DISPLAY_FONT,
    weight: 700,
    url: "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-700-normal.woff",
    fallbackPath: "../../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Bold.woff",
  },
  {
    name: DISPLAY_FONT,
    weight: 500,
    url: "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-500-normal.woff",
    fallbackPath: "../../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Regular.woff",
  },
  {
    name: MONO_FONT,
    weight: 500,
    url: "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.woff",
    fallbackPath: "../../../node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff",
  },
];

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({
  type,
  props: { style, children },
});

const truncateText = (text: string | undefined, maxLength: number) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

const titleSize = (title: string) => {
  if (title.length > 78) return 44;
  if (title.length > 48) return 52;
  return 60;
};

const toArrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const fetchFont = async (url: string, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`);
    }
    return response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
};

const loadFont = async (spec: FontSpec) => {
  try {
    return await fetchFont(spec.url);
  } catch {
    const buffer = await readFile(new URL(spec.fallbackPath, import.meta.url));
    return toArrayBuffer(buffer);
  }
};

const fontDataPromise = Promise.all(fontSpecs.map(loadFont));

const renderOg = ({ title, type }: OgProps) => {
  const displayTitle = type === "Portfolio" ? `${siteConfig.name}.` : title;
  const size = titleSize(displayTitle);

  return h(
    "div",
    {
      width: "100%",
      height: "100%",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: 60,
      overflow: "hidden",
      background: `linear-gradient(135deg, ${colors.stone900} 0%, ${colors.stone800} 62%, ${colors.ember950} 100%)`,
      fontFamily: DISPLAY_FONT,
    },
    [
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          marginBottom: 40,
        },
        [
          h(
            "div",
            {
              background: colors.ember600,
              color: colors.white,
              padding: "8px 16px",
              borderRadius: 6,
              fontFamily: DISPLAY_FONT,
              fontSize: 20,
              fontWeight: 700,
            },
            type
          ),
        ]
      ),
      h(
        "div",
        {
          width: 960,
          fontSize: size,
          fontWeight: 700,
          color: colors.white,
          lineHeight: 1.14,
          marginBottom: 40,
        },
        truncateText(displayTitle, 108)
      ),
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          marginTop: "auto",
          fontFamily: DISPLAY_FONT,
          fontSize: 24,
          fontWeight: 500,
          color: colors.stone300,
        },
        "prathamp.com"
      ),
    ]
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("blog");
  const projects = await getCollection("projects");
  const notes = await getCollection("notes", ({ data }) => !data.draft);

  const blogPaths = posts.map((post) => ({
    params: { slug: `blog/${post.slug}` },
    props: {
      title: post.data.title,
      type: "Blog",
      description: post.data.description,
      metaItems: post.data.tags,
    },
  }));

  const projectPaths = projects.map((project) => ({
    params: { slug: `projects/${project.slug}` },
    props: {
      title: project.data.title,
      type: "Project",
      description: project.data.description,
      metaItems: project.data.tech,
    },
  }));

  const notePaths = notes.map((note) => ({
    params: { slug: `notes/${note.slug}` },
    props: {
      title: note.data.title,
      type: "Note",
      description: note.data.topic ? `Notes on ${note.data.topic}.` : "Field notes and working prompts.",
      metaItems: note.data.topic ? [note.data.topic] : ["notes"],
    },
  }));

  const sectionPaths = [
    {
      params: { slug: "blog" },
      props: {
        title: "Writing",
        type: "Blog" as const,
        description: "Breaking down research papers, deriving ideas from scratch, and making complex topics intuitive.",
        metaItems: ["blog"],
      },
    },
    {
      params: { slug: "projects" },
      props: {
        title: "Projects",
        type: "Project" as const,
        description: "A collection of projects I've built. Each one taught me something new.",
        metaItems: ["projects"],
      },
    },
    {
      params: { slug: "notes" },
      props: {
        title: "Notes",
        type: "Note" as const,
        description: "Quick notes, TILs, and things I'm learning. Less polished, more frequent.",
        metaItems: ["notes"],
      },
    },
    {
      params: { slug: "about" },
      props: {
        title: "About",
        type: "About" as const,
        description: "Learn more about me and my journey as a developer.",
        metaItems: ["about"],
      },
    },
    {
      params: { slug: "contact" },
      props: {
        title: "Contact",
        type: "Contact" as const,
        description: "Get in touch with me.",
        metaItems: ["contact"],
      },
    },
  ];

  return [
    {
      params: { slug: "default" },
      props: {
        title: siteConfig.name,
        type: "Portfolio",
        description: siteConfig.description,
        metaItems: ["data scientist", "machine learning", "technical writing"],
      },
    },
    ...sectionPaths,
    ...blogPaths,
    ...projectPaths,
    ...notePaths,
  ];
};

export const GET: APIRoute = async ({ props }) => {
  const ogProps = props as OgProps;
  const fontData = await fontDataPromise;

  const svg = await satori(
    renderOg(ogProps),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fontSpecs.map((font, index) => ({
        name: font.name,
        data: fontData[index],
        weight: font.weight,
        style: "normal",
      })),
    }
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
