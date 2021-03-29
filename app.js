const WPAPI = require("wpapi");
const fetch = require("node-fetch");
const base64 = require("base-64");


const NODE_ENV = process.env.NODE_ENV || 'development';
const URL = `https://careers-${NODE_ENV ? 'stg' : 'vtex'}.mmg.vfg.mybluehost.me/wp-json`;
const USER = process.env.WP_USER;
const TOKEN = process.env.WP_TOKEN;
const LEVER_API_TOKEN = process.env.LEVER_API_TOKEN;

const wp = new WPAPI({
  endpoint: URL,
  username: USER,
  password: TOKEN,
});

console.log(URL);

wp.postings = wp.registerRoute('wp/v2', '/postings/(?P<id>)');
wp.categories = wp.registerRoute('wp/v2', '/categories/(?P<id>)');
wp.fromTo = wp.registerRoute('acf/v2', '/options');

function compareArrays(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (!b.includes(a[i])) {
      return false;
    }
  }

  return true;
}

function compareObjects(a, b) {
  const aProperties = Object.getOwnPropertyNames(a);
  const bProperties = Object.getOwnPropertyNames(b);

  if (aProperties.length !== bProperties.length) {
    return false;
  }

  for (let i = 0; i < aProperties.length; i++) {
    const propertiesName = aProperties[i];

    if (a[propertiesName] !== b[propertiesName]) {
      return false;
    }
  }

  return true;
}

function containsObjectInArray(objectItem, objectArray) {
  for (let i = 0; i < objectArray.length; i++) {
    if (compareObjects(objectItem, objectArray[i])) {
      return true;
    }
  }

  return false;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLeverData() {
  console.log('Carregando vagas cadastradas na Lever ...');

  const postings = await (await fetch(
    'https://api.lever.co/v1/postings?limit=1000&state=published', {
      headers: { Authorization: `Basic ${base64.encode(LEVER_API_TOKEN)}` }
    }))
    .json();

  const wp_postings = [];

  for (const posting of postings.data) {
    const originalDescription = posting.content.description;
    let title = 'ABOUT THE TEAM AND THE OPPORTUNITY';
    let indexPostingDesc = posting.content.description.indexOf(title);

    if (indexPostingDesc === -1) {
      title = 'About the team';
      indexPostingDesc = posting.content.description.indexOf(title);
    }

    if (indexPostingDesc === -1) {
      title = 'ABOUT THE TEAM AND OPPORTUNITY';
      indexPostingDesc = posting.content.description.indexOf(title);
    }

    if (indexPostingDesc === -1) {
      title = 'IN THIS ROLE, YOU WILL ';
      indexPostingDesc = posting.content.description.indexOf(title);
    }

    if (indexPostingDesc === -1) {
      title = 'ABOUT THE POOL AND OPPORTUNITY';
      indexPostingDesc = posting.content.description.indexOf(title);
    }

    debugger;

    if (indexPostingDesc !== -1) {
      posting.content.description = posting.content.description.substring(
        indexPostingDesc,
      );

      indexPostingDesc = posting.content.description.indexOf('/div>');
      posting.content.description = posting.content.description.substring(
        indexPostingDesc + 5,
      );

      posting.content.description = `<div>${title}</div>${
        posting.content.description
      }`;
    }

    let lists = '';

    posting.content.lists.forEach((item) => {
      lists = `${lists}<div style="list-header">${item.text}</div>`;
      lists = `${lists}<div style="list-content">${item.content}</div>`;
    });

    const wp_posting = {
      title: `${posting.text} - ${posting.categories.location}`,
      content: '',
      status: "publish",
      slug: `${posting.text}-${posting.categories.location}`,
      meta: {
        posting_name: posting.text,
        category_commitment: posting.categories.commitment || '',
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
      categories: [],
    };

    wp_postings.push(wp_posting);
  }

  console.log(`${wp_postings.length} vagas carregadas com sucesso!\n`);

  return wp_postings;
}

async function getPosts() {
  console.log('\nCarregando vagas cadastradas no Wordpress ...');

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
          await wp.postings()
            .perPage(100)
            .page(nextPage)
            .then(next)
            .catch(next);
        }
      }
    }
  };

  await wp.postings()
    .perPage(100)
    .then(next)
    .catch(next);
  await sleep(200);

  console.log(`${posts.length} vagas carregadas com sucesso!\n`);

  return posts;
}

async function getWpCategories() {
  console.log('Atualizando categorias cadastradas no Wordpress ...');

  const categories = [];
  const next = async (x) => {
    if (x.length > 0) {
      for (const category of x) {
        categories.push(category);
      }

      if (x._paging.links.next) {
        const nextUrl = x._paging.links.next;
        const pageParam = nextUrl.match('[?&]page=([^&]+)');
        const nextPage = pageParam && pageParam.length ? pageParam[1] : null;

        if (nextPage) {
          await wp.categories()
            .perPage(100)
            .page(nextPage)
            .then(next)
            .catch(next);
        }
      }
    }
  };

  await wp.categories()
    .perPage(100)
    .then(next)
    .catch(next);
  await sleep(200);

  console.log(`${categories.length} categorias carregadas com sucesso!\n`);

  return categories;
}

async function getLeverLocations(leverPostings) {
  console.log('Carregando localizações dos posts no Lever ...');

  const locations = [];

  for (const leverPosting of leverPostings) {
    if (leverPosting.meta.category_location.length) {
      const leverPostingLocations = leverPosting.meta.category_location.split(' ou ');

      for (const location of leverPostingLocations) {
        const currentLocation = location.replace('&', '&amp;')

        if (!locations.includes(currentLocation)) {
          locations.push(currentLocation);
        }
      }
    }
  }

  return locations;
}

async function getLeverDepartments(leverPostings) {
  console.log('Carregando departamentos dos posts no Lever ...');

  const departments = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_department &&
      leverPosting.meta.category_department.length
    ) {
      const department = leverPosting.meta.category_department.replace('&', '&amp;');

      if (!departments.includes(department)) {
        departments.push(department);
      }
    }
  }

  return departments;
}

async function getLeverTeams(leverPostings) {
  console.log('Carregando times dos posts no Lever ...\n');

  const teams = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_team &&
      leverPosting.meta.category_department &&
      leverPosting.meta.category_department.length > 0 &&
      leverPosting.meta.category_team.length > 0
    ) {
      const team = {
        name: leverPosting.meta.category_team.replace('&', '&amp;'),
        department: leverPosting.meta.category_department,
      };

      if (!containsObjectInArray(team, teams)) {
        teams.push(team);
      }
    }
  }

  return teams;
}

async function getLeverWorkTypes(leverPostings) {
  console.log('Carregando tipos de vagas dos posts no Lever ...\n');

  const workTypes = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_commitment &&
      leverPosting.meta.category_commitment.length
    ) {
      const workType = leverPosting.meta.category_commitment.replace('&', '&amp;');

      if (!workTypes.includes(workType)) {
        workTypes.push(workType);
      }
    }
  }

  return workTypes;
}

async function getFromTo() {
  console.log('Carregando lista de "de/para" ...');

  let fromTo = null;
  const next = async (x) => {
    if (x && x.acf) {
      fromTo = x.acf;
    }
  };

  await wp.fromTo().then(next).catch(next);
  await sleep(200);

  console.log('Lista de "de/para" carregados com sucesso!\n');

  return fromTo;
}

async function updatePosts(
  leverPostings,
  wpPostings,
  wpCategories,
  fromToLocations,
) {
  console.log('Analisando as vagas cadastradas ...\n');

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

  const departamentsParent = wpCategories.find(
    (wC) => wC.name === 'Departaments' && wC.parent === 0,
  );
  const locationsParent = wpCategories.find(
    (wC) => wC.name === 'Locations' && wC.parent === 0,
  );
  const workTypesParent = wpCategories.find(
    (wC) => wC.name === 'Work Types' && wC.parent === 0,
  );

  for (const wpPosting of wpPostings) {
    for (const leverPosting of leverPostings) {
      const postCategories = [];

      // Location category
      const postLocations = leverPosting.meta.category_location.split(' ou ');
  
      if (postLocations && postLocations.length) {
        for (const postLocation of postLocations) {

          // Verifica o de para
          const fromToLocation = fromToLocations.find(
            (fTL) => fTL.locations_from === postLocation,
          );
          let currentPostLocation = null;

          if (fromToLocation && fromToLocation.locations_from === postLocation) {
            // Se tiver, subistitui
            currentPostLocation = wpCategories.find((wC) => (
              wC.name === fromToLocation.locations_to &&
              wC.parent === locationsParent.id
            ));
          } else {
            // Se não tiver, usa o do lever
            currentPostLocation = wpCategories.find((wC) => (
              wC.name === postLocation &&
              wC.parent === locationsParent.id
            ));
          }

          if (currentPostLocation) {
            postCategories.push(currentPostLocation.id);
          }
        }
      }

      // Department category
      const currentPostDepartment = wpCategories.find((wC) => (
        wC.name === leverPosting.meta.category_department &&
        wC.parent === departamentsParent.id
      ));

      if (currentPostDepartment && currentPostDepartment.id) {
        postCategories.push(currentPostDepartment.id);

        // Team category
        const currentPostTeam = wpCategories.find((wC) => (
          wC.name === leverPosting.meta.category_team &&
          wC.parent === currentPostDepartment.id
        ));

        if (currentPostTeam && currentPostTeam.id) {
          postCategories.push(currentPostTeam.id);
        }
      }

      // Work type category
      const currentPostWorkType = wpCategories.find((wC) => (
        wC.name === leverPosting.meta.category_commitment &&
        wC.parent === workTypesParent.id
      ));

      if (
        currentPostWorkType &&
        currentPostWorkType.id &&
        !postCategories.includes(currentPostWorkType.id)
      ) {
        postCategories.push(currentPostWorkType.id);
      }

      let hasCategoriesUpdate = false;

      // updating
      if (
        wpPosting.acf.posting_id &&
        wpPosting.acf.posting_id === leverPosting.meta.posting_id
      ) {
        if (!compareArrays(wpPosting.categories, postCategories)) {
          hasCategoriesUpdate = true;
          wpPosting.categories = postCategories;
          leverPosting.categories = postCategories;
        }

        if (
          wpPosting.acf.updated_at &&
          leverPosting.meta.updated_at && (
            leverPosting.meta.updated_at > wpPosting.acf.updated_at ||
            hasCategoriesUpdate
          )
        ) {
          hasUpdate = true;

          await wp.postings()
            .id(wpPosting.id)
            .update(leverPosting);
          await sleep(200);

            console.log(
              '\x1b[36m%s\x1b[0m',
              `Atualizando vaga: "${
                wpPosting.title.rendered.replace('&#8211;', '-')
              }"`,
            );
        }
      }

      // creating step 1
      if (!wpPostingsIDs.includes(leverPosting.meta.posting_id)) {
        if (!compareArrays(leverPosting.categories, postCategories)) {
          wpPosting.categories = postCategories;
          leverPosting.categories = postCategories;
        }

        createPostsRepo.push(leverPosting);
        wpPostingsIDs.push(leverPosting.meta.posting_id);
      }
    }

    // removing
    if (wpPosting && wpPosting.acf) {
      if (
        !wpPosting.acf.posting_id ||
        !leverPostingsIDs.includes(wpPosting.acf.posting_id)
      ) {
        hasUpdate = true;

        await wp.postings()
          .id(wpPosting.id)
          .delete()
          .catch((err) => console.log(err));
        await sleep(200);

        console.log(
          '\x1b[35m%s\x1b[0m',
          `Removendo vaga: "${wpPosting.title.rendered.replace('&#8211;', '-')}"`,
        );
      }
    }
  }

  // creating step 2
  if (createPostsRepo.length > 0) {
    for (const newPost of createPostsRepo) {
      hasUpdate = true;

      await wp.postings().create(newPost);
      await sleep(200);

      console.log('\x1b[32m%s\x1b[0m', `Criando vaga: "${newPost.title}"`);
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
    console.log('\nVagas atualizadas com sucesso!\n');
  } else {
    console.log('Nenhuma vaga foi atualizada.\n');
  }
}

async function updateCategories(
  leverDepartments,
  leverLocations,
  leverTeams,
  leverWorkTypes,
  fromToLocations
) {
  wpCategories = await getWpCategories();

  // Departaments
  console.log('Analisando os departamentos cadastrados ...\n');

  const createDepartmentRepositore = [];
  const parentDepartment = wpCategories.find((wC) => wC.name === 'Departaments');
  let hasDepartmentUpdate = false;

  if (parentDepartment) {
    const wpDepartments = wpCategories.filter((wC) => (
      wC.parent === parentDepartment.id
    ));

    for (const leverDepartment of leverDepartments) {
      const wpLocation = wpDepartments.find((wD) => wD.name === leverDepartment);

      if (!wpLocation) {
        const newDepartment = {
          name: leverDepartment,
          parent: parentDepartment.id,
        };

        createDepartmentRepositore.push(newDepartment);
      }
    }
  }

  if (createDepartmentRepositore.length) {
    for (const newDepartment of createDepartmentRepositore) {
      hasDepartmentUpdate = true;

      await wp.categories().create(newDepartment);
      await sleep(200);

      console.log(`Criando Departamento: "${newDepartment.name}"`);
    }
  }

  if (hasDepartmentUpdate) {
    console.log('Departamentos atualizados com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhuma departamento foi atualizado.\n');
  }

  // Work Types
  console.log('Analisando os tipos de vagas cadastrados ...\n');

  const createWorkTypesRepositore = [];
  const parentWorkType = wpCategories.find((wC) => wC.name === 'Work Types');
  let hasWorkTypeUpdate = false;

  if (parentWorkType) {
    const wpWorkTypes = wpCategories.filter((wC) => (
      wC.parent === parentWorkType.id
    ));

    for (const leverWorkType of leverWorkTypes) {
      const wpWorkType = wpWorkTypes.find((wD) => wD.name === leverWorkType);

      if (!wpWorkType) {
        const newWorkTypes = {
          name: leverWorkType,
          parent: parentWorkType.id,
        };

        createWorkTypesRepositore.push(newWorkTypes);
      }
    }
  }

  if (createWorkTypesRepositore.length) {
    for (const newWorkType of createWorkTypesRepositore) {
      hasWorkTypeUpdate = true;

      await wp.categories().create(newWorkType);
      await sleep(200);

      console.log(`Criando Tipo de Vaga: "${newWorkType.name}"`);
    }
  }

  if (hasWorkTypeUpdate) {
    console.log('Tipos de vagas atualizados com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhuma tipo de vaga foi atualizado.\n');
  }

  // Locations
  console.log('Analisando as localizações cadastradas ...\n');

  const createLocationRepositore = [];
  const parentLocation = wpCategories.find((wC) => wC.name === 'Locations');
  let hasLocationUpdate = false;

  if (parentLocation) {
    const wpLocations = wpCategories.filter((wC) => wC.parent === parentLocation.id);

    for (const leverLocation of leverLocations) {
      let hasLocationFix = false;
      let newLocationName = leverLocation;

      for (const fromToLocation of fromToLocations) {
        if (
          fromToLocation &&
          fromToLocation.locations_from &&
          fromToLocation.locations_from === leverLocation
        ) {
          newLocationName = fromToLocation.locations_to;
          hasLocationFix = true;
        }
      }

      const wpLocation = wpLocations.find((wL) => wL.name === leverLocation);
      const newWpLocation = wpLocations.find((wL) => wL.name === newLocationName);

      if (hasLocationFix && wpLocation && !newWpLocation) {
        hasLocationUpdate = true;

        await wp.categories().id(wpLocation.id).update({
          name: newLocationName,
          slug: `${newLocationName}-${wpLocation.id}`
        });
        await sleep(200);

        console.log(
          '\x1b[36m%s\x1b[0m',
          `Atualizando localização: de "${leverLocation}" para "${newLocationName}"`,
        );
      } else if (!wpLocation && !newWpLocation) {
        createLocationRepositore.push({
          name: newLocationName,
          parent: parentLocation.id,
        });
      }
    }
  }

  if (createLocationRepositore.length) {
    for (const newLocation of createLocationRepositore) {
      hasLocationUpdate = true;

      await wp.categories().create(newLocation).catch(err => console.log(JSON.stringify(err)));
      await sleep(200);

      console.log(`Criando Localização: "${newLocation.name}"`);
    }
  }

  if (hasLocationUpdate) {
    console.log('\nLocalizações atualizadas com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhuma localização foi atualizada.\n');
  }

  // Teams
  console.log('Analisando os times cadastrados ...\n');

  const createTeamsRepositore = [];
  let hasTeamUpdate = false;

  if (parentDepartment) {
    for (const leverTeam of leverTeams) {
      const parentTeam = wpCategories.find((wC) => (
        wC.name === leverTeam.department &&
        wC.parent === parentDepartment.id
      ));
  
      if (parentTeam && parentTeam.id) {
        const wpTeam = wpCategories.find((wC) => (
          wC.name === leverTeam.name &&
          wC.parent === parentTeam.id
        ));
  
        if (!wpTeam) {
          const newTeam = {
            name: leverTeam.name,
            parent: parentTeam.id,
          };
  
          createTeamsRepositore.push(newTeam);
        }
      }
    }
  }

  if (createTeamsRepositore.length) {
    for (const newTeam of createTeamsRepositore) {
      hasTeamUpdate = true;

      await wp.categories().create(newTeam);
      await sleep(200);

      console.log(`Criando Time: "${newTeam.name}"`);
    }
  }

  if (hasTeamUpdate) {
    console.log('\nTimes atualizados com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhum time foi atualizado.\n');
  }

  return wpCategories;
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
  const leverLocations = await getLeverLocations(leverPostings);
  const leverDepartments = await getLeverDepartments(leverPostings);
  const leverTeams = await getLeverTeams(leverPostings);
  const leverWorkTypes = await getLeverWorkTypes(leverPostings);
  const fromTo = await getFromTo();
  const wpCategories = await updateCategories(
    leverDepartments,
    leverLocations,
    leverTeams,
    leverWorkTypes,
    fromTo.locations || [],
  );

  await updatePosts(
    leverPostings,
    wpPostings,
    wpCategories,
    fromTo.locations || [],
  );

  console.log('Processo concluído com sucesso!\n');
}

applyJob();

const ABOUT_US = `VTEX is the only multitenant commerce platform capable of unifying experiences in all sales channels. With a robust solution, scalable cloud infrastructure and powerful tooling, our platform accelerates the transformation of complex operations. More than 2900 renowned companies of varying sizes and segments, with operations in 42 countries and in global expansion, have at VTEX the solution for the online sale of their products, among them major names such as Sony, Motorola, Walmart, Whirlpool, Coca-Cola, Stanley Black & Decker, and Nestlé.`;

const OUR_CULTURE = `<div><span style="font-size: 24px">OUR CULTURE</span></div><div><br></div><div><b>TRUST TO BE TRUSTED: </b>We trust each other without reservations and delegate our responsibilties <span style="font-size: 15px">continuously</span>. To be trustworthy you need honesty, transparency and consistency in quality and performance. This bond is built upon exchange: trust to be trusted.</div><div><br></div><div><b>BUILD FOR COMMUNITY:</b> It's all about being ready to grow and reach new levels together. When you have a solid foundation, modular thinking and a scalable essence, you're building for the community. We are global but we're audacious enough to aim for the stars.</div><div><br></div><div><b>BE BOLD: </b>Boldness is about challenging the status quo and not being afraid to make mistakes or take risks. We test new alternatives, walk into the unknown and explore possibilities no one thought about. To be bold is to apologize instead of asking for permission.</div>`;
