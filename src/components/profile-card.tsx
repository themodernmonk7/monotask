const ProfileCard = ({ name, role }: { name: string; role: string }) => {
  return (
    <div className="card">
      <h1 style={{ color: 'blue' }}>{name}</h1>
      <p>Occupation: {role}</p>
    </div>
  );
};

export default ProfileCard;
