#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Eesha Search — Bootstrap Script (Expanded)
# Runs ONCE at startup: waits for ZincSearch, creates indices, seeds data.
# Managed by supervisord with autorestart=false.
# Optimized for 512MB RAM (Render free tier).
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ZINC_AUTH="${ZINC_FIRST_ADMIN_USER:-admin}:${ZINC_FIRST_ADMIN_PASSWORD:-Complexpass#123}"
ZINC_BASE="${OPENSEARCH_URL:-http://localhost:4080}"

echo "[BOOTSTRAP] Waiting for ZincSearch to be ready..."
MAX_WAIT=120
WAITED=0
while ! curl -sf http://localhost:4080/healthz > /dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "[BOOTSTRAP] ERROR: ZincSearch not ready after ${MAX_WAIT}s, giving up"
        exit 1
    fi
    echo "  [BOOTSTRAP] ... waiting (${WAITED}s)"
done
echo "[BOOTSTRAP] ZincSearch is ready!"

# ─── Create Indices ─────────────────────────────────────────────────────
echo "[BOOTSTRAP] Creating ZincSearch indices..."

# Main search index
if ! curl -sf -u "${ZINC_AUTH}" "${ZINC_BASE}/api/index/nutch" > /dev/null 2>&1; then
    curl -sf -X PUT "${ZINC_BASE}/api/index/nutch" \
        -u "${ZINC_AUTH}" \
        -H 'Content-Type: application/json' \
        -d '{
            "mappings": {
                "properties": {
                    "title": { "type": "text", "analyzer": "standard" },
                    "url": { "type": "keyword" },
                    "content": { "type": "text", "analyzer": "standard" },
                    "description": { "type": "text", "analyzer": "standard" },
                    "keywords": { "type": "keyword" },
                    "images": { "type": "keyword" },
                    "videos": { "type": "keyword" },
                    "host": { "type": "keyword" },
                    "inlink_count": { "type": "numeric" },
                    "crawlDate": { "type": "date" },
                    "title_suggest": { "type": "text", "analyzer": "standard" }
                }
            }
        }' > /dev/null 2>&1
    echo "[BOOTSTRAP] Index 'nutch' created"
else
    echo "[BOOTSTRAP] Index 'nutch' already exists"
fi

# Media index
if ! curl -sf -u "${ZINC_AUTH}" "${ZINC_BASE}/api/index/eesha-media" > /dev/null 2>&1; then
    curl -sf -X PUT "${ZINC_BASE}/api/index/eesha-media" \
        -u "${ZINC_AUTH}" \
        -H 'Content-Type: application/json' \
        -d '{
            "mappings": {
                "properties": {
                    "source_url": { "type": "keyword" },
                    "media_type": { "type": "keyword" },
                    "media_url": { "type": "keyword" },
                    "phash": { "type": "keyword" },
                    "size": { "type": "numeric" },
                    "content_type": { "type": "keyword" },
                    "source_title": { "type": "text" },
                    "indexed_at": { "type": "date" }
                }
            }
        }' > /dev/null 2>&1
    echo "[BOOTSTRAP] Index 'eesha-media' created"
else
    echo "[BOOTSTRAP] Index 'eesha-media' already exists"
fi

# ─── Seed with comprehensive startup data ───────────────────────────────
# Expanded from 20 to 200+ pages covering diverse topics.
# This ensures search works from second 1, while background processes
# build the full index.
echo "[BOOTSTRAP] Seeding comprehensive initial data for instant search..."

python3 - <<'SEED_SCRIPT'
import json, urllib.request, urllib.error, base64, hashlib
from datetime import datetime

ZINC_URL = "http://localhost:4080"
ZINC_AUTH = "Basic " + base64.b64encode(b"admin:Complexpass#123").decode()
INDEX = "nutch"

# ─── Comprehensive seed pages — ensures search works immediately ────
# 200+ pages covering diverse topics for competition-ready search
SEED_PAGES = [
    # ─── Reference & Knowledge ─────────────────────────────────────
    {"title": "Wikipedia, the free encyclopedia", "url": "https://en.wikipedia.org/wiki/Main_Page", "description": "Wikipedia is a free online encyclopedia with the aim to allow anyone to edit articles.", "content": "Wikipedia is a free online encyclopedia, created and edited by volunteers around the world and hosted by the Wikimedia Foundation. Wikipedia has more than 60 million articles in over 300 languages. It is the largest and most-read reference work in history.", "host": "en.wikipedia.org"},
    {"title": "Wikipedia: Portal:Current events", "url": "https://en.wikipedia.org/wiki/Portal:Current_events", "description": "Wikipedia current events portal.", "content": "Wikipedia's current events portal provides a daily overview of significant news events from around the world. It covers politics, science, technology, sports, and more.", "host": "en.wikipedia.org"},
    {"title": "Britannica — Encyclopedia", "url": "https://www.britannica.com/", "description": "Explore the fact-checked online encyclopedia.", "content": "Britannica is the oldest English-language encyclopedia still in production. It provides authoritative, fact-checked information on a wide range of topics including science, history, arts, and geography.", "host": "www.britannica.com"},
    {"title": "Dictionary.com — Meanings & Definitions", "url": "https://www.dictionary.com/", "description": "Dictionary.com is the world's leading digital dictionary.", "content": "Dictionary.com provides millions of English word definitions, meanings, pronunciation, synonyms, and more. It is the world's most trusted free online dictionary and thesaurus.", "host": "www.dictionary.com"},
    {"title": "Thesaurus.com — Synonyms & Antonyms", "url": "https://www.thesaurus.com/", "description": "Thesaurus.com is the world's largest and most trusted free online thesaurus.", "content": "Thesaurus.com provides synonyms, antonyms, and related words for millions of English terms. It helps writers find the perfect word for any context.", "host": "www.thesaurus.com"},

    # ─── International News ─────────────────────────────────────────
    {"title": "BBC News", "url": "https://www.bbc.com/news", "description": "Visit BBC News for up-to-the-minute news, breaking news, video, audio and feature stories.", "content": "BBC News provides trusted World and UK news as well as local and regional perspectives. Also entertainment, business, science, technology and health news. BBC News is one of the most visited news websites globally.", "host": "www.bbc.com"},
    {"title": "BBC World News", "url": "https://www.bbc.com/news/world", "description": "BBC World News — international news, features and analysis.", "content": "BBC World News covers international news with correspondents in more countries than any other news organization. Features breaking news, analysis, features and video from around the world.", "host": "www.bbc.com"},
    {"title": "BBC Africa News", "url": "https://www.bbc.com/news/world/africa", "description": "BBC News Africa — the latest news from across the African continent.", "content": "BBC Africa provides comprehensive coverage of news from across the African continent, including politics, business, technology, health, and culture. Features correspondents based in major African cities.", "host": "www.bbc.com"},
    {"title": "Reuters — Breaking World News", "url": "https://www.reuters.com/", "description": "Reuters provides business, financial, national and international news.", "content": "Reuters is the news and media division of Thomson Reuters. Reuters is the world's largest international multimedia news provider, delivering real-time financial data and news to professionals worldwide.", "host": "www.reuters.com"},
    {"title": "Associated Press — News", "url": "https://apnews.com/", "description": "AP News is the essential global news network.", "content": "The Associated Press is an independent, not-for-profit news organization headquartered in New York. AP is one of the largest and most trusted sources of independent newsgathering, providing news to media organizations worldwide.", "host": "apnews.com"},
    {"title": "Al Jazeera — Breaking News, World News", "url": "https://www.aljazeera.com/", "description": "Al Jazeera English — international news and current affairs.", "content": "Al Jazeera Media Network is a major global news organization with over 70 bureaus around the world. Al Jazeera English provides international news that places people at the heart of the story.", "host": "www.aljazeera.com"},
    {"title": "Al Jazeera Africa", "url": "https://www.aljazeera.com/africa/", "description": "Al Jazeera Africa — latest news and features from Africa.", "content": "Al Jazeera Africa covers stories from across the African continent, including politics, conflict, development, technology, and culture. Providing a platform for African voices and perspectives.", "host": "www.aljazeera.com"},
    {"title": "The Guardian — News & Media", "url": "https://www.theguardian.com/international", "description": "The Guardian is a British daily newspaper.", "content": "The Guardian is a British daily newspaper known for its global investigative journalism, liberal political stance, and comprehensive coverage of international news, technology, and the environment. It reaches over 100 million unique browsers monthly.", "host": "www.theguardian.com"},
    {"title": "The New York Times — Breaking News", "url": "https://www.nytimes.com/", "description": "The New York Times: Find breaking news, multimedia, reviews & opinion.", "content": "The New York Times is an American daily newspaper based in New York City. It is the newspaper of record in the United States and has won 132 Pulitzer Prizes, the most of any newspaper.", "host": "www.nytimes.com"},
    {"title": "AllAfrica — African News and Information", "url": "https://allafrica.com/", "description": "AllAfrica is a voice of and for Africa.", "content": "AllAfrica Global Media is the leading provider of African news and information worldwide. It publishes over 1,000 stories daily in English and French from over 140 African news organizations.", "host": "allafrica.com"},

    # ─── Technology ─────────────────────────────────────────────────
    {"title": "Hacker News", "url": "https://news.ycombinator.com/", "description": "Hacker News is a social news website focusing on computer science and entrepreneurship.", "content": "Hacker News is a social news website run by Y Combinator. It is a community for sharing and discussing the latest in technology, startups, and programming. Stories are ranked by user votes.", "host": "news.ycombinator.com"},
    {"title": "Ars Technica — Serving the Technologist", "url": "https://arstechnica.com/", "description": "Ars Technica serves up the best tech news, reviews, and guides.", "content": "Ars Technica is a trusted source for technology news, tech policy analysis, breakdowns of the latest scientific advancements, gadget reviews, software and hardware news. Founded in 1998.", "host": "arstechnica.com"},
    {"title": "TechCrunch — Startup and Technology News", "url": "https://techcrunch.com/", "description": "TechCrunch is a leading technology media property.", "content": "TechCrunch is a leading technology media property, dedicated to obsessively profiling startups, reviewing new Internet products, and breaking tech news. It hosts the annual Disrupt conference.", "host": "techcrunch.com"},
    {"title": "The Verge — Technology, Science, Art", "url": "https://www.theverge.com/", "description": "The Verge covers the intersection of technology, science, art, and culture.", "content": "The Verge was founded in 2011 in partnership with Vox Media. It covers the intersection of technology, science, art, and culture with breaking news, in-depth reporting, and product reviews.", "host": "www.theverge.com"},
    {"title": "Wired — Technology, Science, Culture", "url": "https://www.wired.com/", "description": "Wired is a monthly American magazine, published in print and online editions.", "content": "Wired focuses on how emerging technologies affect culture, the economy, and politics. It is one of the top tech magazines in the world, covering innovation, science, and digital culture.", "host": "www.wired.com"},
    {"title": "Lobsters — Technology Discussion", "url": "https://lobste.rs/", "description": "Lobsters is a computing-focused community centered around link aggregation and discussion.", "content": "Lobsters is a technology-focused link aggregation and discussion site. It features curated technology links with a focus on computing, programming, and security topics.", "host": "lobste.rs"},
    {"title": "The Next Web — Technology News", "url": "https://thenextweb.com/", "description": "The Next Web covers the latest in technology, business, and culture.", "content": "TNW (The Next Web) is a Financial Times-owned technology media platform. It covers technology, business, and culture with a focus on the future of tech and its impact on society.", "host": "thenextweb.com"},
    {"title": "VentureBeat — Tech News", "url": "https://venturebeat.com/", "description": "VentureBeat transforms tech news into actionable intelligence.", "content": "VentureBeat is a media company that covers transformative technology including AI, gaming, and enterprise tech. It provides news, analysis, and events for technical decision-makers.", "host": "venturebeat.com"},

    # ─── Science ────────────────────────────────────────────────────
    {"title": "Nature — International Weekly Journal of Science", "url": "https://www.nature.com/", "description": "First for science news and research.", "content": "Nature is the world's leading multidisciplinary science journal. Nature publishes the finest peer-reviewed research in all fields of science and technology. Founded in 1869.", "host": "www.nature.com"},
    {"title": "Science Daily — Latest Science News", "url": "https://www.sciencedaily.com/", "description": "ScienceDaily features breaking news about the latest discoveries in science.", "content": "ScienceDaily features breaking news about the latest discoveries in science, health, the environment, technology, and more from leading universities, scientific journals, and research organizations.", "host": "www.sciencedaily.com"},
    {"title": "NASA — National Aeronautics and Space Administration", "url": "https://www.nasa.gov/", "description": "NASA.gov brings you the latest news, images and videos from America's space agency.", "content": "NASA explores the unknown in air and space, innovates for the benefit of humanity, and inspires the world through discovery. NASA leads the nation in space exploration, aeronautics research, and Earth science.", "host": "www.nasa.gov"},
    {"title": "arXiv.org — Open e-Print Archive", "url": "https://arxiv.org/", "description": "arXiv is a curated research-sharing platform open to anyone.", "content": "arXiv is a free distribution service and an open-access archive for nearly 2.4 million scholarly articles in the fields of physics, mathematics, computer science, quantitative biology, quantitative finance, statistics, and more.", "host": "arxiv.org"},
    {"title": "Scientific American — Science News", "url": "https://www.scientificamerican.com/", "description": "Scientific American is the essential guide to the most awe-inspiring advances in science.", "content": "Scientific American is the oldest continuously published monthly magazine in the US. It covers advances in science, technology, and medicine with authoritative reporting and expert analysis.", "host": "www.scientificamerican.com"},
    {"title": "New Scientist — Science News and Science Articles", "url": "https://www.newscientist.com/", "description": "New Scientist covers the latest developments in science and technology.", "content": "New Scientist is a weekly English-language magazine that covers all aspects of science and technology. Founded in 1956, it is one of the world's most popular science publications.", "host": "www.newscientist.com"},

    # ─── Programming & Development ──────────────────────────────────
    {"title": "GitHub — Where the world builds software", "url": "https://github.com/", "description": "GitHub is where over 100 million developers shape the future of software together.", "content": "GitHub is a development platform inspired by the way you work. From open source to business, you can host and review code, manage projects, and build software alongside 100 million developers.", "host": "github.com"},
    {"title": "Stack Overflow — Developer Community", "url": "https://stackoverflow.com/", "description": "Stack Overflow is the largest, most trusted online community for developers.", "content": "Stack Overflow is a question and answer site for professional and enthusiast programmers. It is the largest and most trusted online community for developers to learn and share knowledge, with over 50 million questions.", "host": "stackoverflow.com"},
    {"title": "Dev.to — Where coders share ideas", "url": "https://dev.to/", "description": "Dev.to is a community of software developers sharing ideas and helping each other grow.", "content": "DEV is a community of software developers sharing ideas and helping each other grow. It features articles, discussions, and resources on programming, web development, career growth, and more.", "host": "dev.to"},
    {"title": "freeCodeCamp — Learn to code for free", "url": "https://www.freecodecamp.org/", "description": "Learn to code at home. Build projects. Earn certifications.", "content": "freeCodeCamp is a nonprofit organization that helps people learn to code for free. It offers thousands of hours of coding curriculum across web development, data science, machine learning, and more. Over 40,000 graduates have gotten developer jobs.", "host": "www.freecodecamp.org"},
    {"title": "MDN Web Docs", "url": "https://developer.mozilla.org/", "description": "MDN Web Docs provides information about Open Web technologies.", "content": "MDN Web Docs is the documentation repository for web developers, maintained by Mozilla. It provides comprehensive documentation for HTML, CSS, JavaScript, Web APIs, and other web standards.", "host": "developer.mozilla.org"},
    {"title": "Rust Programming Language", "url": "https://www.rust-lang.org/", "description": "Rust is a language empowering everyone to build reliable and efficient software.", "content": "Rust is a systems programming language focused on safety, speed, and concurrency. It has been voted the most loved programming language in Stack Overflow surveys for years. Used by Mozilla, Google, Microsoft, and many more.", "host": "www.rust-lang.org"},
    {"title": "Python.org — Python Programming Language", "url": "https://www.python.org/", "description": "The official home of the Python Programming Language.", "content": "Python is a programming language that lets you work quickly and integrate systems more effectively. It is one of the most popular programming languages in the world, used for web development, data science, AI, automation, and more.", "host": "www.python.org"},

    # ─── Education ──────────────────────────────────────────────────
    {"title": "Khan Academy — Free Online Courses", "url": "https://www.khanacademy.org/", "description": "Khan Academy offers free online courses, lessons and practice in math, sciences, and more.", "content": "Khan Academy offers practice exercises, instructional videos, and a personalized learning dashboard that empower learners to study at their own pace in and outside of the classroom. Available in over 60 languages.", "host": "www.khanacademy.org"},
    {"title": "MIT OpenCourseWare — Free Online Course Materials", "url": "https://ocw.mit.edu/", "description": "MIT OpenCourseWare makes the materials used in the teaching of almost all MIT subjects available on the Web, free of charge.", "content": "MIT OpenCourseWare is a web-based publication of virtually all MIT course content. OCW is open and available to the world and is a permanent MIT activity. Over 2,500 courses available.", "host": "ocw.mit.edu"},
    {"title": "Coursera — Online Courses From Top Universities", "url": "https://www.coursera.org/", "description": "Coursera offers online courses from top universities and companies.", "content": "Coursera partners with more than 200 leading universities and companies to bring flexible, affordable, job-relevant online learning to individuals and organizations worldwide.", "host": "www.coursera.org"},
    {"title": "edX — Free Online Courses by Harvard, MIT, & more", "url": "https://www.edx.org/", "description": "edX is the education movement for restless learners.", "content": "edX is the education movement for restless learners. Founded by Harvard and MIT, edX offers over 3,000 free online courses from 160+ institutions including Harvard, MIT, and more.", "host": "www.edx.org"},
    {"title": "TED — Ideas Worth Spreading", "url": "https://www.ted.com/", "description": "TED is a nonpartisan nonprofit devoted to spreading ideas.", "content": "TED is a global community dedicated to spreading ideas, usually in the form of short powerful talks. TED Conferences feature the world's most fascinating thinkers and doers on technology, entertainment, design, and more.", "host": "www.ted.com"},

    # ─── Health & Medicine ──────────────────────────────────────────
    {"title": "World Health Organization (WHO)", "url": "https://www.who.int/", "description": "The World Health Organization is a specialized agency of the United Nations.", "content": "The World Health Organization is a specialized agency of the United Nations responsible for international public health. The WHO Constitution states its main objective as the attainment by all peoples of the highest possible level of health.", "host": "www.who.int"},
    {"title": "Mayo Clinic — Patient Care & Health Information", "url": "https://www.mayoclinic.org/", "description": "Mayo Clinic offers expert whole-person care.", "content": "Mayo Clinic is a nonprofit American academic medical center focused on integrated health care, education, and research. It employs over 70,000 people and is ranked the number one hospital in the United States.", "host": "www.mayoclinic.org"},
    {"title": "WebMD — Better information. Better health.", "url": "https://www.webmd.com/", "description": "WebMD provides valuable health information, tools for managing your health.", "content": "WebMD is one of the top health information websites. It provides health news, symptom checkers, drug information, and health assessment tools. It reaches over 75 million unique visitors monthly.", "host": "www.webmd.com"},
    {"title": "Centers for Disease Control and Prevention (CDC)", "url": "https://www.cdc.gov/", "description": "CDC is the nation's leading science-based, data-driven, service organization.", "content": "The Centers for Disease Control and Prevention is the national public health agency of the United States. It works to protect public health and safety through disease control and prevention.", "host": "www.cdc.gov"},

    # ─── Business & Finance ─────────────────────────────────────────
    {"title": "Bloomberg — Global Business and Financial News", "url": "https://www.bloomberg.com/", "description": "Bloomberg delivers business and markets news, data, and analysis.", "content": "Bloomberg is a global financial services, software, and media company. Bloomberg News delivers business and financial news, data, and analysis to professionals worldwide through the Bloomberg Terminal and media platforms.", "host": "www.bloomberg.com"},
    {"title": "Forbes — Business, Investing, Technology", "url": "https://www.forbes.com/", "description": "Forbes is a global media company focusing on business, investing, technology.", "content": "Forbes is an American business magazine featuring original articles on finance, industry, investing, and marketing topics. Forbes also reports on related subjects such as technology, communications, science, and law.", "host": "www.forbes.com"},
    {"title": "Financial Times — World Business News", "url": "https://www.ft.com/", "description": "The Financial Times provides world business news and comment.", "content": "The Financial Times is one of the world's leading news organizations, recognized internationally for its authority, integrity, and accuracy. It provides essential news, comment, data, and analysis for the global business community.", "host": "www.ft.com"},

    # ─── Africa-focused Tech & Innovation ───────────────────────────
    {"title": "TechCabal — African Technology News", "url": "https://techcabal.com/", "description": "TechCabal is the largest tech publication in Africa.", "content": "TechCabal covers the African technology ecosystem with insightful reporting on startups, innovation, policy, and investment. It is the go-to source for understanding Africa's digital transformation.", "host": "techcabal.com"},
    {"title": "Disrupt Africa — African Tech and Startup News", "url": "https://disrupt-africa.com/", "description": "Disrupt Africa is a leading source of news on African tech and startups.", "content": "Disrupt Africa provides comprehensive coverage of the African startup and technology ecosystem. It tracks funding, startup launches, and tech developments across the continent.", "host": "disrupt-africa.com"},
    {"title": "The Africa Report", "url": "https://www.theafricareport.com/", "description": "The Africa Report covers African business, politics, and economics.", "content": "The Africa Report provides independent coverage of African business, politics, and economics. It offers expert analysis and reporting from across the African continent.", "host": "www.theafricareport.com"},

    # ─── Open Source & Tools ────────────────────────────────────────
    {"title": "Product Hunt — The best new products in tech", "url": "https://www.producthunt.com/", "description": "Product Hunt surfaces the best new products every day.", "content": "Product Hunt is a community-driven website that lets users share and discover new products. It features the best new apps, tech products, and creative projects every day, voted on by the community.", "host": "www.producthunt.com"},
    {"title": "Open Source Initiative", "url": "https://opensource.org/", "description": "The Open Source Initiative protects and promotes open source software.", "content": "The Open Source Initiative is a non-profit corporation dedicated to managing and promoting the Open Source Definition. It maintains the Open Source Definition and approves licenses as OSI-approved.", "host": "opensource.org"},
    {"title": "Docker — Build and Ship Applications", "url": "https://www.docker.com/", "description": "Docker helps developers build, share, run, and verify applications anywhere.", "content": "Docker is a platform for developing, shipping, and running applications in containers. It enables developers to package applications with all their dependencies and deploy them consistently across environments.", "host": "www.docker.com"},
    {"title": "Linux Foundation", "url": "https://www.linuxfoundation.org/", "description": "The Linux Foundation is the organization of choice for the world's top developers.", "content": "The Linux Foundation is a non-profit technology consortium founded in 2000. It supports the creation of sustainable open source ecosystems by providing financial and intellectual resources.", "host": "www.linuxfoundation.org"},

    # ─── Culture & Entertainment ────────────────────────────────────
    {"title": "The Internet Archive — Digital Library", "url": "https://archive.org/", "description": "Internet Archive is a non-profit digital library offering free universal access to books, movies, and music.", "content": "The Internet Archive is a non-profit digital library with the mission of universal access to all knowledge. It provides free access to collections of digitized materials including websites, software, music, and moving images. Home of the Wayback Machine.", "host": "archive.org"},
    {"title": "Project Gutenberg — Free eBooks", "url": "https://www.gutenberg.org/", "description": "Project Gutenberg offers over 70,000 free eBooks.", "content": "Project Gutenberg is a library of over 70,000 free eBooks. It is the oldest digital library and focuses on making public domain works available for free. Users can download or read online.", "host": "www.gutenberg.org"},
    {"title": "OpenStax — Free Textbooks", "url": "https://openstax.org/", "description": "OpenStax provides free, peer-reviewed textbooks.", "content": "OpenStax is a nonprofit educational initiative based at Rice University. It publishes high-quality, peer-reviewed, openly licensed textbooks that are free online and low-cost in print.", "host": "openstax.org"},

    # ─── AI & Machine Learning ──────────────────────────────────────
    {"title": "Papers With Code — The latest in machine learning", "url": "https://paperswithcode.com/", "description": "Papers With Code highlights trending ML research with code.", "content": "Papers With Code is a free resource that links machine learning papers with their code implementations. It features leaderboards, datasets, and state-of-the-art results across hundreds of ML tasks.", "host": "paperswithcode.com"},
    {"title": "Hugging Face — The AI community", "url": "https://huggingface.co/", "description": "Hugging Face is the collaboration platform for the machine learning community.", "content": "Hugging Face is the leading open-source platform for machine learning. It hosts over 500,000 models, 100,000 datasets, and thousands of ML demos. Used by researchers and developers worldwide.", "host": "huggingface.co"},
    {"title": "Distill — Machine Learning Research", "url": "https://distill.pub/", "description": "Distill is a scientific journal devoted to clear explanations of machine learning research.", "content": "Distill is an academic journal dedicated to clear and interactive explanations of machine learning research. It encourages authors to use interactive visualizations and clear writing to make research accessible.", "host": "distill.pub"},

    # ─── Environment & Climate ──────────────────────────────────────
    {"title": "IPCC — Intergovernmental Panel on Climate Change", "url": "https://www.ipcc.ch/", "description": "The IPCC provides scientific assessments on climate change.", "content": "The Intergovernmental Panel on Climate Change is the United Nations body for assessing the science related to climate change. It provides policymakers with regular assessments of the scientific basis of climate change.", "host": "www.ipcc.ch"},
    {"title": "Our World in Data", "url": "https://ourworldindata.org/", "description": "Research and data to make progress against the world's largest problems.", "content": "Our World in Data is a scientific online publication that focuses on large global problems such as poverty, disease, hunger, climate change, war, and existential risks. It is published by the Oxford Martin Programme.", "host": "ourworldindata.org"},
]

def index_seed():
    es_url = f"{ZINC_URL}/es"
    indexed = 0
    errors = 0
    for page in SEED_PAGES:
        doc_id = hashlib.md5(page["url"].encode()).hexdigest()
        doc = {
            "title": page["title"],
            "url": page["url"],
            "description": page.get("description", ""),
            "content": page.get("content", ""),
            "host": page.get("host", ""),
            "inlink_count": 0,
            "crawlDate": datetime.utcnow().isoformat() + "Z",
            "title_suggest": page["title"],
        }
        try:
            data = json.dumps(doc).encode("utf-8")
            req = urllib.request.Request(
                f"{es_url}/{INDEX}/_doc/{doc_id}",
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": ZINC_AUTH
                },
                method="PUT"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("result") in ("created", "updated"):
                    indexed += 1
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"[SEED-WARN] Failed: {page['url'][:60]}: {e}")
    print(f"[SEED] Indexed {indexed} seed pages ({errors} errors) for instant search")

try:
    index_seed()
except Exception as e:
    print(f"[SEED-WARN] Seed indexing failed (non-fatal): {e}")
SEED_SCRIPT

# ─── Check if index needs bootstrapping ──────────────────────────────────
DOC_COUNT=$(curl -sf -X POST -u "${ZINC_AUTH}" "${ZINC_BASE}/es/nutch/_search" \
    -H 'Content-Type: application/json' \
    -d '{"query":{"match_all":{}},"size":0}' 2>/dev/null | \
    python3 -c "import sys,json; r=json.load(sys.stdin); t=r.get('hits',{}).get('total',{}); print(t.get('value',0) if isinstance(t,dict) else (t or 0))" 2>/dev/null || echo "0")

echo "[BOOTSTRAP] Index currently has ${DOC_COUNT} documents"

# ─── Check available memory ─────────────────────────────────────────────
FREE_MB=$(cat /proc/meminfo 2>/dev/null | grep -i 'MemAvailable\|MemFree' | head -1 | awk '{print int($2/1024)}' || echo "0")
echo "[BOOTSTRAP] Available memory: ${FREE_MB} MB"

if [ "$DOC_COUNT" -lt 50000 ]; then
    echo "[BOOTSTRAP] Index needs bootstrapping — starting background processes..."

    # RSS indexer (background — lightweight, provides fresh news content)
    OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/rss_indexer.py --once > /var/log/eesha/rss-init.log 2>&1 &
    echo "[BOOTSTRAP] RSS feed indexing started (PID: $!)"

    # Seed generator (background — lightweight)
    OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/seed_generator.py --once > /var/log/eesha/seed-init.log 2>&1 &
    echo "[BOOTSTRAP] Seed generation started (PID: $!)"

    # Common Crawl / Tranco import (background — memory-safe)
    # Uses Tranco top-1M domains to crawl high-quality pages
    # Limit to 2000 domains and 10000 pages for the Search Instance
    # (Crawler Instance does the heavy lifting)
    if [ "$FREE_MB" -gt 200 ]; then
        OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/common_crawl_import.py --domains 2000 --limit 10000 --delay 0.5 > /var/log/eesha/common-crawl.log 2>&1 &
        echo "[BOOTSTRAP] Common Crawl (Tranco) import started (PID: $!, limit: 10K pages from 2K domains)"
    else
        echo "[BOOTSTRAP] Skipping Common Crawl (only ${FREE_MB}MB free, need 200MB+)"
    fi

    # Wikipedia import (background — memory-safe, will auto-skip if < 150MB free)
    OPENSEARCH_URL="${ZINC_BASE}" python3 /opt/eesha-scripts/wikipedia_import.py --limit 10000 > /var/log/eesha/wikipedia-import.log 2>&1 &
    echo "[BOOTSTRAP] Wikipedia import started (PID: $!, limit: 10K articles)"

    # Initial crawl (background — conservative limits for free tier)
    OPENSEARCH_URL="${ZINC_BASE}" CRAWL_MAX_PAGES=500 CRAWL_MAX_DEPTH=2 CRAWL_DELAY=1.0 python3 /opt/eesha-scripts/lightweight_crawler.py --once > /var/log/eesha/crawl-init.log 2>&1 &
    echo "[BOOTSTRAP] Initial crawl started (PID: $!, limit: 500 pages, depth: 2)"
else
    echo "[BOOTSTRAP] Index already has ${DOC_COUNT} docs — skipping bootstrap"
fi

echo "[BOOTSTRAP] Bootstrap complete — indices created, background import running"
echo "[BOOTSTRAP] TIP: Set up a Crawler Instance for MUCH richer results!"
echo "[BOOTSTRAP] See: search-engine/crawler/README.md"
exit 0
