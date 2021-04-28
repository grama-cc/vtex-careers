const WPAPI = require("wpapi");
const fetch = require("node-fetch");
const base64 = require("base-64");

const URL = 'https://careers-vtex.mmg.vfg.mybluehost.me/wp-json';
const USER = process.env.WP_USER;
const TOKEN = process.env.WP_TOKEN;
const LEVER_API_TOKEN = process.env.LEVER_API_TOKEN;

const AREAS_OF_WORK_CATEGORY_NAME = 'Areas of Work';
const LOCATIONS_CATEGORY_NAME = 'Locations';
const SENIORITY_LEVEL_CATEGORY_NAME = 'Seniority Level';

const wp = new WPAPI({
  endpoint: URL,
  username: USER,
  password: TOKEN,
});

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

function getWpCategory(wpCategories, name, parent) {
  let currentName = name;

  if (currentName && currentName.length) {
    currentName = name.replace(/&amp;/g, '%amp;')
      .replace(/&/g, '&amp;')
      .replace(/%amp;/g, '&amp;');
  } else {
    return null;
  }

  if (wpCategories && wpCategories.length) {
    if (parent || parent === 0) {
      return wpCategories.find((wC) => (
        wC.name.toLowerCase() === currentName.toLowerCase() &&
        wC.parent === parent
      ));
    } else {
      return wpCategories.find((wC) => wC.name.toLowerCase() === currentName.toLowerCase());
    }
  }
  
  return null;
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

  console.log(`... ${wp_postings.length} vagas carregadas com sucesso!`);

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

  console.log(`... ${posts.length} vagas carregadas com sucesso!\n`);

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

  console.log(`... ${categories.length} categorias carregadas com sucesso!\n`);

  return categories;
}

async function getLeverLocations(leverPostings) {
  console.log('Carregando localizações dos posts do Lever ...');

  const locations = [];

  for (const leverPosting of leverPostings) {
    if (leverPosting.meta.category_location.length) {
      const leverPostingLocations = leverPosting.meta.category_location
        .replace(/,\s/g, ' ou ')
        .replace(/\s, /g, ' ou ')
        .replace(/,/g, ' ou ')
        .split(' ou ');

      for (const location of leverPostingLocations) {
        const currentLocation = location.replace(/&amp;/g, '&');

        if (!locations.includes(currentLocation)) {
          locations.push(currentLocation);
        }
      }
    }
  }

  console.log(`... ${locations.length} localizações carregadas com sucesso!\n`);

  return locations;
}

async function getLeverDepartments(leverPostings) {
  console.log('Carregando departamentos dos posts do Lever ...');

  const departments = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_department &&
      leverPosting.meta.category_department.length
    ) {
      const department = leverPosting.meta.category_department.replace(/&amp;/g, '&');

      if (!departments.includes(department)) {
        departments.push(department);
      }
    }
  }

  console.log(`... ${departments.length} departamentos carregados com sucesso!\n`);

  return departments;
}

async function getLeverTeams(leverPostings) {
  console.log('Carregando times dos posts do Lever ...');

  const teams = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_team &&
      leverPosting.meta.category_department &&
      leverPosting.meta.category_department.length > 0 &&
      leverPosting.meta.category_team.length > 0
    ) {
      const team = {
        name: leverPosting.meta.category_team.replace(/&amp;/g, '&'),
        department: leverPosting.meta.category_department,
      };

      if (!containsObjectInArray(team, teams)) {
        teams.push(team);
      }
    }
  }

  console.log(`... ${teams.length} times carregados com sucesso!\n`);

  return teams;
}

async function getLeverWorkTypes(leverPostings) {
  console.log('Carregando senioridades dos posts do Lever ...');

  const workTypes = [];

  for (const leverPosting of leverPostings) {
    if (
      leverPosting.meta.category_commitment &&
      leverPosting.meta.category_commitment.length
    ) {
      const workType = leverPosting.meta.category_commitment.replace(/&amp;/g, '&');

      if (!workTypes.includes(workType)) {
        workTypes.push(workType);
      }
    }
  }

  console.log(`... ${workTypes.length} senioridades carregadas com sucesso!\n`);

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

  console.log('... lista de "de/para" carregados com sucesso!\n');

  return fromTo;
}

async function updatePosts(
  leverPostings,
  wpPostings,
  wpCategories,
  fromToLocations,
  fromToDepartments,
  fromToTeams,
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

  const departamentsParent = getWpCategory(wpCategories, AREAS_OF_WORK_CATEGORY_NAME, 0);
  const locationsParent = getWpCategory(wpCategories, LOCATIONS_CATEGORY_NAME, 0);
  const workTypesParent = getWpCategory(wpCategories, SENIORITY_LEVEL_CATEGORY_NAME, 0);

  for (const wpPosting of wpPostings) {
    for (const leverPosting of leverPostings) {
      const postCategories = [];
      const postLocations = leverPosting.meta.category_location.split(' ou ');

      let hasCategoriesUpdate = false;
      let fromToDepartment = null;
      let fromToTeam = null;

      // Location category
      if (postLocations && postLocations.length) {
        for (const postLocation of postLocations) {
          const fromToLocation = fromToLocations.find(
            (fTL) => fTL.locations_from.toLowerCase() === postLocation.toLowerCase(),
          );

          if (
            fromToLocation &&
            fromToLocation.locations_to &&
            fromToLocation.locations_to.length
          ) {
            const newLocationNames = fromToLocation.locations_to
              .replace(/,/g, ';')
              .replace(/;\s/g, ';')
              .replace(/\s;/g, ';')
              .split(';');

            if (
              newLocationNames &&
              newLocationNames.length &&
              newLocationNames.length > 1
            ) {
              for (const newLocationName of newLocationNames) {
                const currentPostLocation = getWpCategory(
                  wpCategories,
                  newLocationName,
                  locationsParent.id,
                )

                if (currentPostLocation) {
                  postCategories.push(currentPostLocation.id);
                }
              }
            } else {
              let currentPostLocation = null;

              if (
                fromToLocation &&
                fromToLocation.locations_from.toLowerCase() === postLocation.toLowerCase()
              ) {
                currentPostLocation = getWpCategory(
                  wpCategories,
                  fromToLocation.locations_to,
                  locationsParent.id,
                );
              } else {
                currentPostLocation = getWpCategory(wpCategories, postLocation, locationsParent.id);
              }

              if (currentPostLocation) {
                postCategories.push(currentPostLocation.id);
              }
            }
          } else {
            const currentPostLocation = getWpCategory(
              wpCategories,
              postLocation,
              locationsParent.id,
            );

            if (currentPostLocation && currentPostLocation.id) {
              postCategories.push(currentPostLocation.id);
            }
          }
        }
      }

      // Department category
      const postDepartment = leverPosting.meta.category_department;
      let currentPostDepartment = getWpCategory(
        wpCategories,
        postDepartment,
        departamentsParent.id,
      );

      if (postDepartment && postDepartment.length) {
        fromToDepartment = fromToDepartments.find((fTD) => (
          fTD.departments_from.toLowerCase() === postDepartment.toLowerCase()
        ));
      }

      if (fromToDepartment) {
        currentPostDepartment = getWpCategory(
          wpCategories,
          fromToDepartment.departments_to,
          departamentsParent.id,
        );
      }

      if (currentPostDepartment && currentPostDepartment.id) {
        postCategories.push(currentPostDepartment.id);

        // Team category
        fromToTeam = fromToTeams.find((fTT) => (
          fTT.teams_from.toLowerCase() === leverPosting.meta.category_team.toLowerCase()
        ));
        let currentPostTeam = null;

        if (fromToTeam) {
          currentPostTeam = getWpCategory(
            wpCategories,
            fromToTeam.teams_to,
            currentPostDepartment.id,
          );
        } else {
          currentPostTeam = getWpCategory(
            wpCategories,
            leverPosting.meta.category_team,
            currentPostDepartment.id,
          );
        }

        if (currentPostTeam && currentPostTeam.id) {
          postCategories.push(currentPostTeam.id);
        }
      }

      // Work type category
      const currentPostWorkType = getWpCategory(
        wpCategories,
        leverPosting.meta.category_commitment,
        workTypesParent.id,
      );

      if (
        currentPostWorkType &&
        currentPostWorkType.id &&
        !postCategories.includes(currentPostWorkType.id)
      ) {
        postCategories.push(currentPostWorkType.id);
      }

      // updating
      if (
        wpPosting.acf.posting_id &&
        wpPosting.acf.posting_id === leverPosting.meta.posting_id
      ) {
        const postingTitleRendered = wpPosting.title.rendered
          .replace(/&#8211;/g, '-')
          .replace(/&#038;/g, '&');

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

          if (fromToDepartment) {
            wpPosting.meta.category_department = fromToDepartment.departments_to;
            leverPosting.meta.category_department = fromToDepartment.departments_to;
          }

          if (fromToTeam) {
            wpPosting.meta.category_team = fromToTeam.teams_to;
            leverPosting.meta.category_team = fromToTeam.teams_to;
          }

          await wp.postings().id(wpPosting.id).update(leverPosting)
            .then(() => console.log(`Atualizando vaga: "${postingTitleRendered}"`))
            .catch((error) => console.log(
              `Erro ao atualizar vaga: "${postingTitleRendered}"\n${error.code}: ${error.message}`,
            ));
          await sleep(200);
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
        const postingTitleRendered = wpPosting.title.rendered
          .replace(/&#8211;/g, '-')
          .replace(/&#038;/g, '&');

        hasUpdate = true;

        await wp.postings().id(wpPosting.id).delete()
          .then(() => console.log(`Removendo vaga: "${postingTitleRendered}"`))
          .catch((error) => console.log(
            `Erro ao remover vaga: "${postingTitleRendered}"\n${error.code}: ${error.message}`,
          ));
        await sleep(200);
      }
    }
  }

  // creating step 2
  if (createPostsRepo.length > 0) {
    for (const newPost of createPostsRepo) {
      hasUpdate = true;

      await wp.postings().create(newPost)
        .then(() => console.log('\x1b[32m%s\x1b[0m', `Criando vaga: "${newPost.title}"`))
        .catch((error) => console.log(
          `Erro ao criar vaga: "${newPost.title}"\n${error.code}: ${error.message}`,
          ));
      await sleep(200);

      
    }
  } else if (wpPostings.length === 0) {
    for (const newPost of leverPostings) {
      hasUpdate = true;

      await wp.postings().create(newPost)
        .then(() => console.log(`Criando vaga: "${newPost.title}"`))
        .catch((error) => console.log(
          `Erro ao criar vaga: "${newPost.title}"\n${error.code}: ${error.message}`,
        ));
      await sleep(200);
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
  fromToLocations,
  fromToDepartments,
  fromToTeams,
  fromToSeniorityLevels,
) {
  wpCategories = await getWpCategories();

  // Locations
  console.log('Analisando as localizações cadastradas ...\n');

  const createLocationRepositore = [];
  const parentLocation = getWpCategory(wpCategories, LOCATIONS_CATEGORY_NAME, 0);
  let hasLocationUpdate = false;

  if (parentLocation && parentLocation.id) {
    const wpLocations = wpCategories.filter((wC) => wC.parent === parentLocation.id);

    for (const leverLocation of leverLocations) {
      const currentFromToLocations = fromToLocations.find(
        (fTL) => fTL.locations_from.toLowerCase() === leverLocation.toLowerCase(),
      );

      if (currentFromToLocations) {
        const newLocationNames = currentFromToLocations.locations_to
          .replace(/,/g, ';')
          .replace(/;\s/g, ';')
          .replace(/\s;/g, ';')
          .split(';');

        if (newLocationNames && newLocationNames.length) {
          if (newLocationNames.length > 1) {
            for (const newLocationName of newLocationNames) {
              const newWpLocation = getWpCategory(wpLocations, newLocationName);

              if (!newWpLocation) {
                createLocationRepositore.push({
                  name: newLocationName,
                  parent: parentLocation.id,
                });
              }
            }
          } else if (newLocationNames.length === 1) {
            const wpLocation = getWpCategory(wpLocations, leverLocation);
            const newLocationName = newLocationNames[0];
            const newWpLocation = getWpCategory(wpLocations, newLocationName);

            if (wpLocation && !newWpLocation) {
              hasLocationUpdate = true;

              await wp.categories().id(wpLocation.id).update({
                name: newLocationName,
              })
                .then(() => console.log(
                  `Atualizando localização: de "${leverLocation}" para "${newLocationName}"`,
                ))
                .catch((error) => console.log(
                  `\nErro ao atulizar localização: de ${leverLocation} para ${
                    newLocationName
                  }\n${error.code}: ${error.message}\n`,
                ));
              await sleep(200);
            } else if (!wpLocation && !newWpLocation) {
              createLocationRepositore.push({
                name: newLocationName,
                parent: parentLocation.id,
              });
            }
          }
        }
      } else {
        const wpLocation = getWpCategory(wpLocations, leverLocation);

        if (!wpLocation) {
          createLocationRepositore.push({ name: leverLocation, parent: parentLocation.id });
        }
      }
    }
  }

  if (createLocationRepositore.length) {
    for (const newLocation of createLocationRepositore) {
      hasLocationUpdate = true;

      await wp.categories()
        .create(newLocation)
        .then(() => console.log(`Criando localização: "${newLocation.name}"`))
        .catch((error) => console.log(
          `\nErro ao criar localização: "${newLocation}"\n${error.code}: ${error.message}\n`,
        ));
      await sleep(200);
    }
  }

  if (hasLocationUpdate) {
    console.log('\nLocalizações atualizadas com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhuma localização foi atualizada.\n');
  }

  // Departments
  console.log('Analisando os departamentos cadastrados ...\n');

  const createDepartmentRepositore = [];
  const parentDepartment = getWpCategory(wpCategories, AREAS_OF_WORK_CATEGORY_NAME, 0);
  let hasDepartmentUpdate = false;

  if (parentDepartment) {
    const wpDepartments = wpCategories.filter((wC) => (
      wC.parent === parentDepartment.id
    ));

    for (const leverDepartment of leverDepartments) {
      const currentFromToDepartment = fromToDepartments.find(
        (fTD) => fTD.departments_from.toLowerCase() === leverDepartment.toLowerCase(),
      );
      const wpDepartment = getWpCategory(wpDepartments, leverDepartment);

      if (currentFromToDepartment) {
        const newWpDepartment = getWpCategory(wpDepartments, currentFromToDepartment.departments_to);

        if (wpDepartment && !newWpDepartment) {
          hasDepartmentUpdate = true;

          await wp.categories().id(wpDepartment.id).update({
            name: currentFromToDepartment.departments_to,
          })
            .then(() => console.log(
              `Atualizando departamento: de "${
                currentFromToDepartment.departments_from
              }" para "${currentFromToDepartment.departments_to}"`,
            ))
            .catch((err) => console.log(
              `\nErro ao atulizar departamento: de ${
                currentFromToDepartment.departments_from
              } para ${
                currentFromToDepartment.departments_to
              }\n${error.code}: ${error.message}\n`,
            ));
          await sleep(200);
        } else if (!newWpDepartment) {
          createDepartmentRepositore.push({
            name: currentFromToDepartment.departments_to,
            parent: parentDepartment.id,
          });
        }
      } else {
        if (!wpDepartment) {
          createDepartmentRepositore.push({
            name: leverDepartment,
            parent: parentDepartment.id,
          });
        }
      }
    }
  }

  if (createDepartmentRepositore.length) {
    for (const newDepartment of createDepartmentRepositore) {
      hasDepartmentUpdate = true;

      await wp.categories().create(newDepartment)
        .then(() => console.log(`Criando departamento: "${newDepartment.name}"`))
        .catch((error) => console.log(
          `Erro ao criar departamento: "${newDepartment.name}"\n${error.code}: ${error.message}`,
        ));
      await sleep(200);
    }
  }

  if (hasDepartmentUpdate) {
    console.log('\nDepartamentos atualizados com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhum departamento foi atualizado.\n');
  }

  // Teams
  console.log('Analisando os times cadastrados ...\n');

  const createTeamsRepositore = [];
  let hasTeamUpdate = false;

  if (parentDepartment) {
    for (const leverTeam of leverTeams) {
      const currentFromToDepartment = fromToDepartments.find(
        (fTD) => fTD.departments_from.toLowerCase() === leverTeam.department.toLowerCase(),
      );
      let parentTeam = getWpCategory(wpCategories, leverTeam.department, parentDepartment.id);

      if (currentFromToDepartment) {
        parentTeam = getWpCategory(
          wpCategories,
          currentFromToDepartment.departments_to,
          parentDepartment.id,
        );
      }

      if (parentTeam && parentTeam.id) {
        const wpTeam = getWpCategory(wpCategories, leverTeam.name, parentTeam.id);
        const currentFromToTeam = fromToTeams.find(
          (fTT) => fTT.teams_from.toLowerCase() === leverTeam.name.toLowerCase(),
        );

        if (currentFromToTeam) {
          const newWpTeam = getWpCategory(wpCategories, currentFromToTeam.teams_to, parentTeam.id);

          if (wpTeam && !newWpTeam) {
            await wp.categories().id(wpTeam.id).update({
              name: currentFromToTeam.teams_to,
            })
              .then(() => console.log(
                `Atualizando time: de "${currentFromToTeam.teams_from}" para "${
                  currentFromToTeam.teams_to
                }"`,
              ))
              .catch((error) => console.log(
                `\nErro ao atulizar time: de ${currentFromToTeam.teams_from} para ${
                  currentFromToTeam.teams_to
                }\n${error.code}: ${error.message}\n`,
              ));
            await sleep(200);
          } else if (!newWpTeam) {
            createTeamsRepositore.push({
              name: currentFromToTeam.teams_to,
              parent: parentTeam.id,
            });
          }
        } else if (!wpTeam) {
          createTeamsRepositore.push({
            name: leverTeam.name,
            parent: parentTeam.id,
          });
        }
      }
    }
  }

  if (createTeamsRepositore.length) {
    for (const newTeam of createTeamsRepositore) {
      hasTeamUpdate = true;

      await wp.categories().create(newTeam)
        .then(() => console.log(`Criando time: "${newTeam.name}"`))
        .catch((error) => console.log(
          `Erro ao criar time: "${newTeam.name}"\n${error.code}: ${error.message}`
        ));
      await sleep(200);
    }
  }

  if (hasTeamUpdate) {
    console.log('\nTimes atualizados com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhum time foi atualizado.\n');
  }

  // Work Types
  console.log('Analisando as senioridades cadastradas ...\n');

  const createWorkTypesRepositore = [];
  const parentWorkType = getWpCategory(wpCategories, SENIORITY_LEVEL_CATEGORY_NAME, 0);
  let hasWorkTypeUpdate = false;

  if (parentWorkType && parentWorkType.id) {
    const wpWorkTypes = wpCategories.filter((wC) => wC.parent === parentWorkType.id);

    for (const leverWorkType of leverWorkTypes) {
      const currentFromToSeniorityLevels = fromToSeniorityLevels.find(
        (fTWT) => fTWT.seniority_levels_from.toLowerCase() === leverWorkType.toLowerCase(),
      );

      if (currentFromToSeniorityLevels) {
        const newSeniorityLevelName = currentFromToSeniorityLevels.seniority_levels_to

        if (newSeniorityLevel && newSeniorityLevelName.length) {
          const wpSeniorityLevel = getWpCategory(wpWorkTypes, leverWorkType);
          const newWpSeniorityLevel = getWpCategory(wpSeniorityLevel, newSeniorityLevelName);

          if (wpSeniorityLevel && !newWpSeniorityLevel) {
            hasWorkTypeUpdate = true;

            await wp.categories().id(wpWorkTypes.id).update({
              name: newSeniorityLevelName,
            })
              .then(() => console.log(
                `Atualizando senioridade: de "${leverWorkType}" para "${
                  newSeniorityLevelName
                }"`,
              ))
              .catch((error) => console.log(
                `\nErro ao atulizar senioridade: de ${leverWorkType} para ${
                  newSeniorityLevelName
                }\n${error.code}: ${error.message}\n`,
              ));
            await sleep(200);
          } else if (!wpWorkTypes && !newWpSeniorityLevel) {
            createWorkTypesRepositore.push({
              name: newSeniorityLevelName,
              parent: parentWorkType.id,
            });
          }
        }
      } else {
        const wpSeniorityLevel = getWpCategory(wpWorkTypes, leverWorkType);

        if (!wpSeniorityLevel) {
          createWorkTypesRepositore.push({ name: leverWorkType, parent: parentWorkType.id });
        }
      }
    }
  }

  if (createWorkTypesRepositore.length) {
    for (const newWorkType of createWorkTypesRepositore) {
      hasWorkTypeUpdate = true;

      await wp.categories()
        .create(newWorkType)
        .then(() => console.log(`Criando senioridade: "${newWorkType.name}"`))
        .catch((error) => console.log(
          `\nErro ao criar senioridade: "${newWorkType.name}"\n${error.code}: ${error.message}\n`,
        ));
      await sleep(200);
    }
  }

  if (hasWorkTypeUpdate) {
    console.log('\nSenioridades atualizadas com sucesso!\n');

    wpCategories = await getWpCategories();
  } else {
    console.log('Nenhuma senioridade foi atualizada.\n');
  }

  return wpCategories;
}

async function applyJob() {
  const wpPostings = await getPosts();
  const leverPostings = await getLeverData();
  const leverLocations = await getLeverLocations(leverPostings);
  const leverDepartments = await getLeverDepartments(leverPostings);
  const leverTeams = await getLeverTeams(leverPostings);
  const leverWorkTypes = await getLeverWorkTypes(leverPostings);
  const fromTo = await getFromTo();
  const fromToLocations = fromTo && fromTo.locations ? fromTo.locations : [];
  const fromToDepartments = fromTo && fromTo.departments ? fromTo.departments : [];
  const fromToTeams = fromTo && fromTo.teams ? fromTo.teams : [];
  const fromToSeniorityLevels = fromTo && fromTo.seniority_levels ? fromTo.seniority_levels : [];

  const wpCategories = await updateCategories(
    leverDepartments,
    leverLocations,
    leverTeams,
    leverWorkTypes,
    fromToLocations,
    fromToDepartments,
    fromToTeams,
    fromToSeniorityLevels,
  );

  await updatePosts(
    leverPostings,
    wpPostings,
    wpCategories,
    fromToLocations,
    fromToDepartments,
    fromToTeams,
  );

  console.log('Processo concluído com sucesso!\n');
}

applyJob();

const ABOUT_US = `VTEX is the only multitenant commerce platform capable of unifying experiences in all sales channels. With a robust solution, scalable cloud infrastructure and powerful tooling, our platform accelerates the transformation of complex operations. More than 2900 renowned companies of varying sizes and segments, with operations in 42 countries and in global expansion, have at VTEX the solution for the online sale of their products, among them major names such as Sony, Motorola, Walmart, Whirlpool, Coca-Cola, Stanley Black & Decker, and Nestlé.`;

const OUR_CULTURE = `<div><span style="font-size: 24px">OUR CULTURE</span></div><div><br></div><div><b>TRUST TO BE TRUSTED: </b>We trust each other without reservations and delegate our responsibilties <span style="font-size: 15px">continuously</span>. To be trustworthy you need honesty, transparency and consistency in quality and performance. This bond is built upon exchange: trust to be trusted.</div><div><br></div><div><b>BUILD FOR COMMUNITY:</b> It's all about being ready to grow and reach new levels together. When you have a solid foundation, modular thinking and a scalable essence, you're building for the community. We are global but we're audacious enough to aim for the stars.</div><div><br></div><div><b>BE BOLD: </b>Boldness is about challenging the status quo and not being afraid to make mistakes or take risks. We test new alternatives, walk into the unknown and explore possibilities no one thought about. To be bold is to apologize instead of asking for permission.</div>`;
