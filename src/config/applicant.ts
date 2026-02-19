/**
 * APPLICANT PROFILE
 *
 * Used by the submit/auto-apply service to fill out applications.
 * Resume PDF is stored at data/resume.pdf
 */

export const applicant = {
  name: "Jason Bian",
  email: "jason.bian75@gmail.com",
  phone: "734-730-6569",
  location: "New York, NY",
  resumePath: "data/resume.pdf",
  linkedIn: "https://www.linkedin.com/in/jasonbian",
  github: "https://github.com/IamJasonBian",

  education: [
    {
      school: "University of Texas at Austin",
      degree: "M.S. Computer Science",
      gpa: 3.69,
      expected: "Dec 2025",
    },
    {
      school: "University of Michigan, Ann Arbor",
      degree: "B.S.E. Industrial and Operations Engineering",
      gpa: 3.85,
      graduated: "Dec 2019",
    },
  ],

  experience: [
    { company: "Amazon.com — Supply Chain Optimization Technologies", role: "Data Platform Engineer II", dates: "May 2023 – Present" },
    { company: "Amazon.com — Worldwide Sustainability", role: "Data Engineer II", dates: "Jun 2022 – Present" },
    { company: "Microsoft — Azure Decision Science", role: "Program Manager", dates: "Jan 2020 – Aug 2021" },
    { company: "OptimChain", role: "Founder", dates: "Jan 2020 – Dec 2022" },
  ],

  skills: {
    languages: ["Java", "Python", "Scala"],
    frameworks: ["TypeScript", "React", "JavaScript", "Spark", "pyspark", "pytorch", "airflow", "Kafka"],
    infrastructure: ["AWS", "EMR", "Glue", "S3", "Redshift", "Kinesis", "SQS", "EC2", "Sagemaker", "Step Functions", "Lambda"],
    databases: ["Delta Lake", "Managed MLflow", "Parquet", "Temporal", "Git Actions"],
    ml: ["Reinforcement Learning", "Deep Learning", "Hierarchical Forecasting", "ARIMA", "Stochastic/Convex Optimization"],
  },
};
