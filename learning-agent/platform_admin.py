"""Explicit administrator CLI. Passwords are never accepted in shell arguments."""
import argparse
import getpass
import platform_store as store
import team_orchestrator as team


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('add-user'); create.add_argument('name')
    sub.add_parser('list-users')
    grant = sub.add_parser('grant'); grant.add_argument('project_id'); grant.add_argument('user_id')
    grant.add_argument('role', choices=['owner','executor','reviewer','viewer'])
    args = parser.parse_args(); store.init()
    if args.command == 'add-user':
        first = getpass.getpass('Password (12+ characters): ')
        if first != getpass.getpass('Confirm password: '):
            raise ValueError('Passwords differ')
        print(store.add_user(args.name, first))
    elif args.command == 'list-users':
        with team.connection() as c:
            for row in c.execute('SELECT id,name FROM platform_users ORDER BY name'):
                print(row['id'], row['name'])
    else:
        team.state(args.project_id)
        store.member(args.project_id, args.user_id, args.role)
        print('Role granted')


if __name__ == '__main__':
    main()
