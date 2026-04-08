import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string().optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			category: z.enum(['Google', 'OpenAI', 'Claude', 'ハーネスエンジニアリング', 'その他']).default('その他'),
			tags: z.array(z.string()).default([]),
			originalUrl: z.string().url().optional(), // 元の英語記事などのURL
		}),
});

export const collections = { blog };
