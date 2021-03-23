const WPAPI = require("wpapi");
const fetch = require("node-fetch");
const base64 = require("base-64");

const URL = "https://careers-vtex.mmg.vfg.mybluehost.me/wp-json";
const USER = process.env.WP_USER;
const TOKEN = process.env.WP_TOKEN;
const LEVER_API_TOKEN = process.env.LEVER_API_TOKEN;

const wp = new WPAPI({
  endpoint: URL,
  username: USER,
  password: TOKEN,
});
wp.postings = wp.registerRoute("wp/v2", "/postings/(?P<id>)");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLeverData() {
  console.log("Carregando vagas cadastradas na Lever ...");
  const postings = await (
    await fetch("https://api.lever.co/v1/postings?limit=1000&state=published", {
      headers: {
        Authorization: `Basic ${base64.encode(LEVER_API_TOKEN)}`,
      },
    })
  ).json();

  const wp_postings = [];

  for (const posting of postings.data) {
    const originalDescription = posting.content.description;

    let title = "";
    title = "ABOUT THE TEAM AND THE OPPORTUNITY";
    let indexPostingDesc = posting.content.description.indexOf(title);

    if (indexPostingDesc === -1) {
      title = "About the team";
      indexPostingDesc = posting.content.description.indexOf(title);
    }
    if (indexPostingDesc === -1) {
      title = "ABOUT THE TEAM AND OPPORTUNITY";
      indexPostingDesc = posting.content.description.indexOf(title);
    }
    if (indexPostingDesc === -1) {
      title = "IN THIS ROLE, YOU WILL ";
      indexPostingDesc = posting.content.description.indexOf(title);
    }
    if (indexPostingDesc === -1) {
      title = "ABOUT THE POOL AND OPPORTUNITY";
      indexPostingDesc = posting.content.description.indexOf(title);
    }

    debugger;
    if (indexPostingDesc !== -1) {
      posting.content.description = posting.content.description.substring(
        indexPostingDesc
      );

      indexPostingDesc = posting.content.description.indexOf("/div>");
      posting.content.description = posting.content.description.substring(
        indexPostingDesc + 5
      );

      posting.content.description =
        `<div>${title}</div>` + posting.content.description;
    }

    let lists = "";
    posting.content.lists.forEach((item) => {
      lists += `<div style="list-header">${item.text}</div>`;
      lists += `<div style="list-content">${item.content}</div>`;
    });

    const wp_posting = {
      title: `${posting.text} - ${posting.categories.location}`,
      content: "",
      status: "publish",
      slug: `${posting.text}-${posting.categories.location}`,

      meta: {
        posting_name: posting.text,
        category_commitment: posting.categories.commitment,
        category_department: posting.categories.department,
        category_location: posting.categories.location,
        category_team: posting.categories.team,

        posting_id: posting.id,
        hosted_url: posting.urls && posting.urls.show,
        apply_url: posting.urls && posting.urls.apply,
        created_at: posting.createdAt,
        updated_at: posting.updatedAt,

        about_us: ABOUT_US,
        our_culture: OUR_CULTURE,

        description: originalDescription,
        additional: posting.content.closingHtml,
        lists: lists,
        about_the_team: posting.content.descriptionHtml,
      },
    };

    wp_postings.push(wp_posting);
  }

  console.log(`${wp_postings.length} vagas carregadas com sucesso!\n`);
  return wp_postings;
}

async function getPosts() {
  console.log("\nCarregando vagas cadastradas no Wordpress ...");
  const posts = [];
  const next = async (x) => {
    if (x.length > 0) {
      for (const post of x) {
        posts.push(post);
      }
      if (x._paging.links.next) {
        const nextUrl = x._paging.links.next;
        const pageParam = nextUrl.match('[?&]page=([^&]+)');
        const nextPage = pageParam && pageParam.length ? pageParam[1] : null;

        if (nextPage) {
          await wp
            .postings()
            .perPage(100)
            .page(nextPage)
            .then(next)
            .catch(next);
        }
      }
    }
  };
  await wp.postings().perPage(100).then(next).catch(next);
  await sleep(200);
  console.log(`${posts.length} vagas carregadas com sucesso!\n`);
  return posts;
}

async function updatePosts(leverPostings, wpPostings) {
  console.log(`Analisando as vagas cadastradas ...\n`);
  const wpPostingsIDs = [];
  const leverPostingsIDs = [];
  const createPostsRepo = [];
  let hasUpdate = false;

  for (const leverPosting of leverPostings) {
    leverPostingsIDs.push(leverPosting.meta.posting_id);
  }

  for (const wpPosting of wpPostings) {
    if (wpPosting && wpPosting.acf && wpPosting.acf.posting_id) {
      wpPostingsIDs.push(wpPosting.acf.posting_id);
    }
  }

  for (const wpPosting of wpPostings) {
    for (const leverPosting of leverPostings) {
      //updating
      if (
        wpPosting.acf.posting_id &&
        wpPosting.acf.posting_id === leverPosting.meta.posting_id
      ) {
        if (
          wpPosting.acf.updated_at &&
          leverPosting.meta.updated_at &&
          leverPosting.meta.updated_at > wpPosting.acf.updated_at
        ) {
          hasUpdate = true;
          await wp.postings().id(wpPosting.id).update(leverPosting);
          console.log(
            `Atualizando vaga: "${wpPosting.title.rendered.replace(
              "&#8211;",
              "-"
            )}"`
          );
        }
      }

      //creating step 1
      if (!wpPostingsIDs.includes(leverPosting.meta.posting_id)) {
        createPostsRepo.push(leverPosting);
        wpPostingsIDs.push(leverPosting.meta.posting_id);
      }
    }

    //removing
    if (wpPosting && wpPosting.acf) {
      if (
        !wpPosting.acf.posting_id ||
        !leverPostingsIDs.includes(wpPosting.acf.posting_id)
      ) {
        hasUpdate = true;
        await wp
          .postings()
          .id(wpPosting.id)
          .delete()
          .catch((err) => console.log(err));
  
        console.log(
          `Removendo vaga: "${wpPosting.title.rendered.replace("&#8211;", "-")}"`
        );
      }
    }
  }

  //creating step 2
  if (createPostsRepo.length > 0) {
    for (const newPost of createPostsRepo) {
      hasUpdate = true;
      await wp.postings().create(newPost);
      await sleep(200);
      console.log(`Criando vaga: "${newPost.title}"`);
    }
  } else if (wpPostings.length === 0) {
    for (const newPost of leverPostings) {
      hasUpdate = true;
      await wp.postings().create(newPost);
      await sleep(200);
      console.log(`Criando vaga: "${newPost.title}"`);
    }
  }

  if (hasUpdate) {
    console.log(`\nVagas atualizadas com sucesso!\n`);
  } else {
    console.log(`Nenhuma vaga foi atualizada.\n`);
  }
}

async function applyJob() {
  if (!USER) {
    console.log('\nProcesso interrompido! export WP_USER=\n');
    return;
  }

  if (!TOKEN) {
    console.log('\nProcesso interrompido! export WP_TOKEN=\n');
    return;
  }

  if (!LEVER_API_TOKEN) {
    console.log('\nProcesso interrompido! export LEVER_API_TOKEN=\n');
    return;
  }

  const wpPostings = await getPosts();
  const leverPostings = await getLeverData();
  await updatePosts(leverPostings, wpPostings);
  console.log(`Processo concluído com sucesso!\n`);
}

applyJob();

const ABOUT_US = `VTEX is the only multitenant commerce platform capable of unifying experiences in all sales channels. With a robust solution, scalable cloud infrastructure and powerful tooling, our platform accelerates the transformation of complex operations. More than 2900 renowned companies of varying sizes and segments, with operations in 42 countries and in global expansion, have at VTEX the solution for the online sale of their products, among them major names such as Sony, Motorola, Walmart, Whirlpool, Coca-Cola, Stanley Black & Decker, and Nestlé.`;

const OUR_CULTURE = `<div><span style="font-size: 24px">OUR CULTURE</span></div><div><br></div><div><b>TRUST TO BE TRUSTED: </b>We trust each other without reservations and delegate our responsibilties <span style="font-size: 15px">continuously</span>. To be trustworthy you need honesty, transparency and consistency in quality and performance. This bond is built upon exchange: trust to be trusted.</div><div><br></div><div><b>BUILD FOR COMMUNITY:</b> It's all about being ready to grow and reach new levels together. When you have a solid foundation, modular thinking and a scalable essence, you're building for the community. We are global but we're audacious enough to aim for the stars.</div><div><br></div><div><b>BE BOLD: </b>Boldness is about challenging the status quo and not being afraid to make mistakes or take risks. We test new alternatives, walk into the unknown and explore possibilities no one thought about. To be bold is to apologize instead of asking for permission.</div>`;
